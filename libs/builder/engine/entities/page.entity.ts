import {
	asArray,
	isPresent,
	NgDocDemoAsset,
	NgDocDemoConfig,
	NgDocDemoConfigs,
	NgDocEntityAnchor,
	NgDocPage,
	NgDocPageIndex,
	NgDocSandboxAsset,
	NgDocSandboxConfiguration,
} from '@ng-doc/core';
import crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {forkJoin, from, Observable, of} from 'rxjs';
import {map, switchMap, tap} from 'rxjs/operators';
import {ClassDeclaration, ObjectLiteralExpression} from 'ts-morph';

import {
	buildDemoConfig,
	buildEntityKeyword,
	buildPlaygroundMetadata,
	buildSandboxAssets,
	editFileInRepoUrl,
	formatCode,
	getDemoClassDeclarations,
	getPageType,
	getPlaygroundById,
	getPlaygroundsExpression,
	getPlaygroundsIds,
	marked,
	postProcessHtml,
	processHtml,
	slash,
} from '../../helpers';
import {buildIndexes} from '../../helpers/build-indexes';
import {NgDocBuildOutput, NgDocEntityKeyword, NgDocPlaygroundMetadata} from '../../interfaces';
import {forkJoinOrEmpty} from '../../operators';
import {NgDocActions} from '../actions';
import {renderTemplate} from '../nunjucks';
import {NgDocEntity} from './abstractions/entity';
import {NgDocNavigationEntity} from './abstractions/navigation.entity';
import {CachedEntity, CachedFilesGetter} from './cache/decorators';
import {NgDocCategoryEntity} from './category.entity';

@CachedEntity()
export class NgDocPageEntity extends NgDocNavigationEntity<NgDocPage> {
	playgroundsExpression: ObjectLiteralExpression | undefined;
	demoClassDeclarations: ClassDeclaration[] = [];
	playgroundMetadata: Record<string, NgDocPlaygroundMetadata> = {};
	demoConfigs: NgDocDemoConfigs = {};

	override parent?: NgDocCategoryEntity;

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

	get sandbox(): NgDocSandboxConfiguration | undefined {
		return this.target?.sandbox;
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

	protected override get canBeBuilt(): boolean {
		return isPresent(this.target)
			? !this.target.onlyForTags ||
					asArray(this.target.onlyForTags).includes(this.context.context.target?.configuration ?? '')
			: true;
	}

	override get order(): number | undefined {
		return this.target?.order;
	}

	override get keywords(): NgDocEntityKeyword[] {
		const rootKeywords: NgDocEntityKeyword[] = [...asArray(this.target?.keyword)].map((key: string) => ({
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

	get sandboxId(): string {
		return crypto.createHash('md5').update(this.id).digest('hex');
	}

	/**
	 * Returns full url from the root
	 *
	 * @type {string}
	 */
	get url(): string {
		return `${this.parent ? this.parent.url + '/' : ''}${this.route}`;
	}

	@CachedFilesGetter()
	get mdPath(): string {
		return path.join(this.sourceFileFolder, this.target?.mdFile ?? '');
	}

	get mdFolder(): string {
		return path.dirname(this.mdPath);
	}

	@CachedFilesGetter()
	get demoConfigsPath(): string {
		return path.join(this.folderPath, 'demo.ts');
	}

	@CachedFilesGetter()
	get sandboxAssetPath(): string {
		return path.join(this.context.assetsPath, 'sandbox', `${this.sandboxId}.json`);
	}

	get demoConfigsImport(): string {
		return slash(path.relative(this.context.context.workspaceRoot, this.demoConfigsPath.replace(/\.ts$/, '')));
	}

	@CachedFilesGetter()
	get playgroundsPath(): string {
		return path.join(this.folderPath, 'playgrounds.ts');
	}

	get playgroundIds(): string[] {
		return this.playgroundsExpression ? getPlaygroundsIds(this.playgroundsExpression) : [];
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

		// Refresh source file from file system to make sure that it is up-to-date
		Object.keys(this.playgroundMetadata).forEach((id: string) =>
			this.playgroundMetadata[id].class.getSourceFile().refreshFromFileSystemSync(),
		);

		this.updatePlaygroundMetadata();
		this.updateDemoConfigs();
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

				if (this.objectExpression) {
					this.playgroundsExpression = getPlaygroundsExpression(this.objectExpression);
					this.demoClassDeclarations = getDemoClassDeclarations(this.objectExpression);

					this.updatePlaygroundMetadata();
					this.updateDemoConfigs();
				}
			}),
			tap({
				error: (e: Error) => this.errors.push(e),
			}),
		);
	}

	protected override buildImpl(): Observable<NgDocBuildOutput[]> {
		return this.isReadyForBuild
			? forkJoin([
					this.buildModule(),
					this.buildPlaygrounds(),
					this.buildDemoConfigs(),
					this.buildSandboxAssets(),
			  ]).pipe(map((res) => res.filter(isPresent)))
			: of([]);
	}

	private updatePlaygroundMetadata(): void {
		this.playgroundMetadata = this.playgroundIds.reduce(
			(metadata: Record<string, NgDocPlaygroundMetadata>, id: string) => {
				if (this.playgroundsExpression) {
					const playground: ObjectLiteralExpression | undefined = getPlaygroundById(this.playgroundsExpression, id);

					if (playground) {
						metadata[id] = buildPlaygroundMetadata(id, playground);
					}
				}
				return metadata;
			},
			{},
		);
	}

	private updateDemoConfigs(): void {
		this.demoConfigs = {};

		this.demoClassDeclarations.forEach((classDeclarations: ClassDeclaration) => {
			const classFolder: string = classDeclarations.getSourceFile().getDirectoryPath();
			const configs: NgDocDemoConfigs = buildDemoConfig(classDeclarations, this.context.inlineStyleLanguage);

			this.demoConfigs = {...this.demoConfigs, ...configs};

			// Add demo dependencies to the page
			Object.values(configs).forEach((config: NgDocDemoConfig) =>
				this.dependencies.add(...Object.keys(config.files ?? {}).map((p: string) => path.join(classFolder, p))),
			);
		});
	}

	private buildModule(): Observable<NgDocBuildOutput> {
		if (!this.target) {
			throw new Error(`Failed to build page. Make sure that you define page configuration property correctly.`);
		}

		const template: string = renderTemplate(this.target.mdFile, {
			scope: this.sourceFileFolder,
			context: {
				NgDocPage: this.target,
				NgDocActions: new NgDocActions(this),
			},
			dependenciesStore: this.dependencies,
			filters: false,
		});

		return of(template).pipe(
			map((output: string) => marked(output, this)),
			switchMap((html: string) => processHtml(this, html)),
			map((content: string) => ({
				content,
				filePath: this.modulePath,
				postProcessFn: (content: string) =>
					from(postProcessHtml(this, content)).pipe(
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
								map(() =>
									renderTemplate('./page.module.ts.nunj', {
										context: {
											page: this,
											pageContent: content,
										},
									}),
								),
							),
						),
					),
			})),
		);
	}

	private buildPlaygrounds(): Observable<NgDocBuildOutput> {
		const content: string = renderTemplate('./playgrounds.ts.nunj', {
			context: {
				page: this,
			},
		});

		return of({content: formatCode(content, 'TypeScript'), filePath: this.playgroundsPath});
	}

	private buildDemoConfigs(): Observable<NgDocBuildOutput> {
		return forkJoinOrEmpty(
			Object.keys(this.demoConfigs).map((key: string) =>
				forkJoinOrEmpty(
					this.demoConfigs[key].assets.map((asset: NgDocDemoAsset) =>
						from(processHtml(this, asset.code)).pipe(tap((output: string) => (asset.code = output))),
					),
				),
			),
		).pipe(
			map(() => ({
				content: '',
				filePath: this.demoConfigsPath,
				postProcessFn: (content: string) =>
					of(content).pipe(
						switchMap(() =>
							forkJoinOrEmpty(
								Object.keys(this.demoConfigs).map((key: string) =>
									forkJoinOrEmpty(
										this.demoConfigs[key].assets.map((asset: NgDocDemoAsset) =>
											from(postProcessHtml(this, asset.code)).pipe(tap((output: string) => (asset.code = output))),
										),
									),
								),
							),
						),
						map(() =>
							renderTemplate('./demo-configs.ts.nunj', {
								context: {
									demoConfigs: this.demoConfigs,
								},
							}),
						),
					),
			})),
		);
	}

	private buildSandboxAssets(): Observable<NgDocBuildOutput | null> {
		const assets: Record<string, NgDocSandboxAsset> = buildSandboxAssets(this);

		if (Object.keys(assets).length === 0) {
			return of(null);
		}

		return of({
			content: JSON.stringify(assets),
			filePath: this.sandboxAssetPath,
		});
	}
}
