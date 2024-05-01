import { asArray, NgDocApiScope } from '@ng-doc/core';
import { Observable, of } from 'rxjs';
import { SourceFile } from 'ts-morph';

import { isPageEntity, uniqueName } from '../../helpers';
import { NgDocBuilderContext, NgDocBuildResult, NgDocEntityKeyword } from '../../interfaces';
import { NgDocEntityStore } from '../entity-store';
import { renderTemplate } from '../nunjucks';
import { NgDocEntity } from './abstractions/entity';
import { NgDocRouteEntity } from './abstractions/route.entity';
import { NgDocApiEntity } from './api.entity';
import { NgDocCache } from './cache';
import { CachedEntity } from './cache/decorators';
import { NgDocPageEntity } from './page.entity';

@CachedEntity()
export class NgDocApiScopeEntity extends NgDocRouteEntity<NgDocApiScope> {
  override readonly physical: boolean = false;
  override id: string = uniqueName(`${this.sourceFilePath}#${this.target.route}`);

  constructor(
    override readonly store: NgDocEntityStore,
    override readonly cache: NgDocCache,
    override readonly context: NgDocBuilderContext,
    override readonly sourceFile: SourceFile,
    override parent: NgDocApiEntity,
    override target: NgDocApiScope,
  ) {
    super(store, cache, context, sourceFile);
  }

  override get rootFiles(): string[] {
    return [];
  }

  override get isRoot(): boolean {
    // always false, api scopes are not rooted
    return false;
  }

  override get route(): string {
    return this.target.route;
  }

  override get keywords(): NgDocEntityKeyword[] {
    return [];
  }

  override get folderName(): string {
    return this.route;
  }

  override get cachedFilePaths(): string[] {
    return this.parent.rootFiles;
  }

  /**
   * Returns full url from the root
   * @type {string}
   */
  get url(): string {
    return `${this.parent ? this.parent.url + '/' : ''}${this.route}`;
  }

  get pages(): NgDocPageEntity[] {
    return asArray(this.children.values()).filter(isPageEntity);
  }

  override get title(): string {
    return this.target.name;
  }

  get order(): number | undefined {
    return this.target.order;
  }

  override get buildCandidates(): NgDocEntity[] {
    return this.childEntities;
  }

  override refreshImpl(): Observable<void> {
    // Emitting source file is not necessary for this type of entity
    return of(void 0);
  }

  override compile(): Observable<void> {
    return of(void 0);
  }

  override loadImpl(): Observable<void> {
    return of(void 0);
  }

  override build(): Observable<NgDocBuildResult<string>> {
    if (this.target) {
      const result = renderTemplate('./api-scope.ts.nunj', {
        context: {
          scope: this,
          outFolder: this.folderPath,
        },
      });

      return of({
        result,
        entity: this,
        toBuilderOutput: async (content: string) => ({
          content,
          filePath: this.modulePath,
        }),
      });
    }

    throw new Error(`The entity "${this.id}" is not loaded.`);
  }

  override destroy(): void {
    this.children.forEach((child: NgDocEntity) => child.destroy());

    super.destroy();
  }
}
