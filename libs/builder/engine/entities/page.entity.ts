import { asArray, isPresent, isRoute, NgDocEntityAnchor, NgDocPage } from '@ng-doc/core';
import * as fs from 'fs';
import * as path from 'path';
import { Observable, of } from 'rxjs';
import { map, tap } from 'rxjs/operators';

import { buildEntityKeyword, editFileInRepoUrl } from '../../helpers';
import { NgDocBuildResult, NgDocEntityKeyword } from '../../interfaces';
import { renderTemplate } from '../nunjucks';
import { NgDocEntity } from './abstractions/entity';
import { NgDocNavigationEntity } from './abstractions/navigation.entity';
import { CachedEntity, CachedFilesGetter } from './cache/decorators';
import { NgDocCategoryEntity } from './category.entity';
import { NgDocPageDemoEntity } from './page-demo.entity';
import { NgDocPagePlaygroundEntity } from './page-playground.entity';
import {
  fillIndexesPlugin,
  markdownToHtmlPlugin,
  postProcessHtmlPlugin,
  processHtmlPlugin,
} from './plugins';

/**
 * Represents a page entity
 * @usageNotes
 *
 * notes of
 * usages
 * @publicApi
 * @internal
 */
@CachedEntity()
export class NgDocPageEntity extends NgDocNavigationEntity<NgDocPage> {
  override parent?: NgDocCategoryEntity;

  override get route(): string {
    const folderName: string = path.basename(path.dirname(this.sourceFile.getFilePath()));

    return (
      (isRoute(this.target?.route) ? this.target?.route.path : this.target?.route) ?? folderName
    );
  }

  override get isRoot(): boolean {
    return !this.target?.category;
  }

  override get title(): string {
    return this.target?.title ?? '';
  }

  override get buildCandidates(): NgDocEntity[] {
    return this.parentEntities;
  }

  override get editSourceFileUrl(): string | undefined {
    if (this.context.config.repoConfig) {
      return editFileInRepoUrl(
        this.context.config.repoConfig,
        this.mdPath,
        this.route.toLowerCase(),
      );
    }
    return undefined;
  }

  protected override get canBeBuilt(): boolean {
    return isPresent(this.target)
      ? !this.target.onlyForTags ||
          asArray(this.target.onlyForTags).includes(
            this.context.context.target?.configuration ?? '',
          )
      : true;
  }

  override get order(): number | undefined {
    return this.target?.order;
  }

  override get keywords(): NgDocEntityKeyword[] {
    const rootKeywords: NgDocEntityKeyword[] = [...asArray('')].map((key: string) => ({
      key: `*${key}`,
      title: this.title,
      path: this.fullRoute,
    }));

    return [
      ...rootKeywords,
      ...rootKeywords
        .map((keyword: NgDocEntityKeyword) =>
          this.anchors.map((anchor: NgDocEntityAnchor) =>
            buildEntityKeyword(keyword.key, keyword.title, keyword.path, anchor),
          ),
        )
        .flat(),
    ];
  }

  /**
   * Returns full url from the root
   * @type {string}
   */
  get url(): string {
    return `${this.parent ? this.parent.url + '/' : ''}${this.route}`;
  }

  @CachedFilesGetter()
  get mdPath(): string {
    return path.join(this.sourceFileFolder, this.target?.mdFile[0] ?? '');
  }

  get mdFolder(): string {
    return path.dirname(this.mdPath);
  }

  get hasImports(): boolean {
    return !!this.objectExpression?.getProperty('imports');
  }

  override setParentDynamically(): void {
    super.setParentDynamically();

    this.parent = this.getParentFromCategory();
  }

  override dependenciesChanged(): void {
    super.dependenciesChanged();
  }

  override childrenGenerator(): Observable<NgDocEntity[]> {
    return of([
      new NgDocPageDemoEntity(this.store, this.cache, this.context, this),
      new NgDocPagePlaygroundEntity(this.store, this.cache, this.context, this),
    ]);
  }

  get playgroundEntity(): NgDocPagePlaygroundEntity {
    return this.children.find(
      (child: NgDocEntity) => child instanceof NgDocPagePlaygroundEntity,
    ) as NgDocPagePlaygroundEntity;
  }

  protected override loadImpl(): Observable<void> {
    return super.loadImpl().pipe(
      map(() => {
        if (!isPresent(this.target?.mdFile) || !fs.existsSync(this.mdPath)) {
          throw new Error(
            `Failed to load page. Make sure that you define "mdFile" property correctly and .md file exists.`,
          );
        }

        if (!this.title) {
          throw new Error(`Failed to load page. Make sure that you have a "title" property.`);
        }
      }),
      tap({
        error: (e: Error) => this.errors.push(e),
      }),
    );
  }

  build(): Observable<NgDocBuildResult<string, this>> {
    const result: string = renderTemplate(this.target!.mdFile[0], {
      scope: this.sourceFileFolder,
      context: {
        NgDocPage: this.target,
        NgDocActions: undefined,
      },
      dependencies: this.dependencies,
      filters: false,
    });

    return of({
      result,
      entity: this,
      toBuilderOutput: async (content: string) => ({
        content: renderTemplate('./page.ts.nunj', {
          context: {
            page: this,
            pageContent: content,
          },
        }),
        filePath: this.modulePath,
      }),
      postBuildPlugins: [markdownToHtmlPlugin(), processHtmlPlugin()],
      postProcessPlugins: [postProcessHtmlPlugin(), fillIndexesPlugin()],
    });
  }

  refreshDependencies(): void {
    this.objectExpression
      ?.getSourceFile()
      .getReferencedSourceFiles()
      .forEach((sourceFile) => {
        sourceFile.refreshFromFileSystemSync();
      });
  }
}
