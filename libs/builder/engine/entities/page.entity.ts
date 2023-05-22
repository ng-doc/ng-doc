import {asArray, isPresent, NgDocPage, NgDocPageIndex} from '@ng-doc/core';
import * as fs from 'fs';
import * as path from 'path';
import {forkJoin, from, Observable, of} from 'rxjs';
import {catchError, map, mapTo, switchMap, tap} from 'rxjs/operators';

import {editFileInRepoUrl, getPageType, isDependencyEntity, marked, processHtml} from '../../helpers';
import {buildIndexes} from '../../helpers/build-indexes';
import {NgDocBuiltOutput} from '../../interfaces';
import {NgDocActions} from '../actions';
import {PAGE_DEPENDENCIES_NAME} from '../variables';
import {NgDocEntity} from './abstractions/entity';
import {NgDocNavigationEntity} from './abstractions/navigation.entity';
import {CachedEntity} from './cache/decorators';
import {NgDocCategoryEntity} from './category.entity';
import {NgDocDependenciesEntity} from './dependencies.entity';

@CachedEntity()
export class NgDocPageEntity extends NgDocNavigationEntity<NgDocPage> {
	override parent?: NgDocCategoryEntity;
	override compilable: boolean = true;

	override get route(): string {
		const folderName: string = path.basename(path.dirname(this.sourceFile.getFilePath()));

		return this.target?.route ?? folderName;
	}

	/**
	 * Returns full url from the root
	 *
	 * @type {string}
	 */
	get url(): string {
		return `${this.parent ? this.parent.url + '/' : ''}${this.route}`;
	}

	override get isRoot(): boolean {
		return !this.target?.category;
	}

	override get title(): string {
		return this.target?.title ?? '';
	}

	override get editSourceFileUrl(): string | undefined {
		if (this.context.config.repoConfig) {
			return editFileInRepoUrl(this.context.config.repoConfig, this.mdPath, this.route.toLowerCase());
		}
		return undefined;
	}

	override get canBeBuilt(): boolean {
		return (
			!!this.target &&
			(!this.target.onlyForTags ||
				asArray(this.target.onlyForTags).includes(this.context.context.target?.configuration ?? ''))
		);
	}

	override get order(): number | undefined {
		return this.target?.order;
	}

	override get keywords(): string[] {
		return [...asArray(this.target?.keyword)].map((k: string) => `*${k}`);
	}

	get mdPath(): string {
		return path.join(this.sourceFileFolder, this.target?.mdFile ?? '');
	}

	get mdFolder(): string {
		return path.dirname(this.mdPath);
	}

	override get buildCandidates(): NgDocEntity[] {
		return [...this.parentEntities, ...asArray(this.pageDependencies)];
	}

	get assetsFolder(): string {
		return path.relative(this.context.context.workspaceRoot, path.join(this.folderPath, 'assets'));
	}

	get pageDependencies(): NgDocDependenciesEntity | undefined {
		const expectedPath: string = path.join(this.sourceFileFolder, PAGE_DEPENDENCIES_NAME);
		const entity: NgDocEntity | undefined = this.builder.get(expectedPath, true);

		return entity && isDependencyEntity(entity) ? entity : undefined;
	}

	get componentsAssets(): string | undefined {
		const dependencies: NgDocDependenciesEntity | undefined = this.pageDependencies;

		return dependencies && dependencies.assets.length ? dependencies.componentAssetsImport : undefined;
	}

	override update(): Observable<void> {
		return super.update().pipe(
			tap(() => {
				if (!isPresent(this.target?.mdFile) || !fs.existsSync(this.mdPath)) {
					throw new Error(
						`Failed to load ${this.sourceFile.getFilePath()}. Make sure that you define mdFile property correctly and .md file exists.`,
					);
				}

				if (!this.title) {
					throw new Error(`Failed to load ${this.sourceFile.getFilePath()}. Make sure that you have a title property.`);
				}

				this.parent = this.getParentFromCategory();
			}),
			catchError((error: unknown) => {
				this.readyToBuild = false;
				this.context.context.logger.error(`\n\n${String(error)}`);

				return of(void 0);
			}),
		);
	}

	protected override build(): Observable<NgDocBuiltOutput[]> {
		return this.isReadyForBuild ? forkJoin([this.buildModule()]) : of([]);
	}

	private buildModule(): Observable<NgDocBuiltOutput> {
		if (this.target) {
			const page: Observable<string> = this.builder.renderer
				.render(this.target.mdFile, {
					scope: this.sourceFileFolder,
					context: {
						NgDocPage: this.target,
						NgDocActions: new NgDocActions(this),
					},
					dependenciesStore: this.dependencies,
				})
				.pipe(
					map((output: string) => marked(output, this)),
					switchMap((html: string) => processHtml(this, html)),
					switchMap((content: string) =>
						from(
							buildIndexes({
								title: this.title,
								content,
								pageType: getPageType(this),
								breadcrumbs: this.breadcrumbs,
								route: this.fullRoute,
							}),
						).pipe(
							tap((indexes: NgDocPageIndex[]) => this.indexes.push(...indexes)),
							mapTo(content),
						),
					),
				);

			return page.pipe(
				switchMap((pageContent: string) =>
					this.builder.renderer
						.render('./page.module.ts.nunj', {
							context: {
								page: this,
								pageContent,
							},
						})
						.pipe(map((output: string) => ({content: output, filePath: this.modulePath}))),
				),
			);
		}
		return of();
	}
}
