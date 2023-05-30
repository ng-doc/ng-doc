import {asArray, isPresent, NgDocPage, NgDocPageIndex} from '@ng-doc/core';
import * as fs from 'fs';
import * as path from 'path';
import {forkJoin, from, Observable, of} from 'rxjs';
import {catchError, map, mapTo, switchMap, tap} from 'rxjs/operators';
import {ClassDeclaration, ObjectLiteralExpression} from 'ts-morph';

import {
	editFileInRepoUrl,
	formatCode,
	getComponentAsset,
	getDemoClassDeclarations,
	getPageType,
	getPlaygroundsIds,
	getPlaygroundTargets,
	getTargetForPlayground,
	isStandalone,
	marked,
	processHtml,
	slash,
} from '../../helpers';
import {buildIndexes} from '../../helpers/build-indexes';
import {getPlaygroundsExpression} from '../../helpers/get-playgrounds-expression';
import {NgDocAsset, NgDocBuiltOutput} from '../../interfaces';
import {forkJoinOrEmpty} from '../../operators';
import {NgDocComponentAsset} from '../../types';
import {NgDocActions} from '../actions';
import {NgDocEntity} from './abstractions/entity';
import {NgDocNavigationEntity} from './abstractions/navigation.entity';
import {CachedEntity} from './cache/decorators';
import {NgDocCategoryEntity} from './category.entity';

@CachedEntity()
export class NgDocPageEntity extends NgDocNavigationEntity<NgDocPage> {
	playgroundsExpression: ObjectLiteralExpression | undefined;
	demoClassDeclarations: ClassDeclaration[] = [];
	playgroundClassDeclarations: ClassDeclaration[] = [];
	standalonePlaygroundKeys: string[] = [];

	override parent?: NgDocCategoryEntity;
	override compilable: boolean = true;
	private componentAssets: NgDocComponentAsset = {};

	override get route(): string {
		const folderName: string = path.basename(path.dirname(this.sourceFile.getFilePath()));

		return this.target?.route ?? folderName;
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

	/**
	 * Returns full url from the root
	 *
	 * @type {string}
	 */
	get url(): string {
		return `${this.parent ? this.parent.url + '/' : ''}${this.route}`;
	}

	get mdPath(): string {
		return path.join(this.sourceFileFolder, this.target?.mdFile ?? '');
	}

	get mdFolder(): string {
		return path.dirname(this.mdPath);
	}

	get assets(): NgDocAsset[] {
		return Object.keys(this.componentAssets)
			.map((key: string) => this.componentAssets[key])
			.flat();
	}

	get assetsFolder(): string {
		return path.relative(this.context.context.workspaceRoot, path.join(this.folderPath, 'assets'));
	}

	get demoAssetsPath(): string {
		return path.join(this.folderPath, 'component-assets.ts');
	}

	get demoAssetsImport(): string {
		return slash(path.relative(this.context.context.workspaceRoot, path.join(this.folderPath, 'component-assets')));
	}

	get demoAssets(): string | undefined {
		return this.assets.length ? this.demoAssetsImport : undefined;
	}

	get playgroundsPath(): string {
		return path.join(this.folderPath, 'playgrounds.ts');
	}

	get playgroundIds(): string[] {
		return this.playgroundsExpression ? getPlaygroundsIds(this.playgroundsExpression) : [];
	}

	get hasImports(): boolean {
		return !!this.objectExpression?.getProperty('imports');
	}

	override dependenciesChanged() {
		super.dependenciesChanged();

		this.getTargets().forEach((target: ClassDeclaration) => target.getSourceFile().refreshFromFileSystem());
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

				if (this.objectExpression) {
					this.playgroundsExpression = getPlaygroundsExpression(this.objectExpression);
					this.demoClassDeclarations = getDemoClassDeclarations(this.objectExpression);
					this.playgroundClassDeclarations = asArray(new Set(getPlaygroundTargets(this.objectExpression)));

					this.standalonePlaygroundKeys = asArray(this.playgroundIds
						.reduce((keys: Map<ClassDeclaration, string>, id: string) => {
							if (this.playgroundsExpression) {
								const target: ClassDeclaration | undefined = getTargetForPlayground(this.playgroundsExpression, id);

								if (target && isStandalone(target)) {
									keys.set(target, id);
								}
							}

							return keys;
						}, new Map<ClassDeclaration, string>)
						.values());
				}
			}),
			catchError((error: unknown) => {
				this.readyToBuild = false;
				this.context.context.logger.error(`\n\n${String(error)}`);

				return of(void 0);
			}),
		);
	}

	protected override build(): Observable<NgDocBuiltOutput[]> {
		return this.isReadyForBuild
			? this.fillAssets().pipe(
					switchMap(() => forkJoin([this.buildModule(), this.buildPlaygrounds(), this.buildDemoAssets()])),
			  )
			: of([]);
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
					filters: false,
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

	private buildDemoAssets(): Observable<NgDocBuiltOutput> {
		return this.builder.renderer
			.render('./demo-assets.ts.nunj', {
				context: {
					demoAssets: this.componentAssets,
				},
			})
			.pipe(map((output: string) => ({content: output, filePath: this.demoAssetsPath})));
	}

	private buildPlaygrounds(): Observable<NgDocBuiltOutput> {
		return this.builder.renderer
			.render('./playgrounds.ts.nunj', {
				context: {
					page: this,
				},
			})
			.pipe(
				map((output: string) => ({
					content: formatCode(output, 'TypeScript'),
					filePath: this.playgroundsPath,
				})),
			);
	}

	private getTargets(): ClassDeclaration[] {
		return this.playgroundIds
			.map((pId: string) => this.playgroundsExpression && getTargetForPlayground(this.playgroundsExpression, pId))
			.filter(isPresent);
	}

	private fillAssets(): Observable<void> {
		if (this.objectExpression) {
			this.componentAssets = this.demoClassDeclarations
				.map((classDeclarations: ClassDeclaration) =>
					getComponentAsset(classDeclarations, this.context.inlineStyleLanguage, this.assetsFolder),
				)
				.reduce((acc: NgDocComponentAsset, curr: NgDocComponentAsset) => ({...acc, ...curr}), {});

			this.dependencies.add(...this.assets.map((asset: NgDocAsset) => asset.originalPath));

			return forkJoinOrEmpty(
				Object.keys(this.componentAssets).map((key: string) =>
					forkJoinOrEmpty(
						this.componentAssets[key].map((asset: NgDocAsset) =>
							from(processHtml(this, asset.output)).pipe(tap((output: string) => (asset.output = output))),
						),
					),
				),
			).pipe(mapTo(void 0));
		}

		return of(void 0);
	}
}
