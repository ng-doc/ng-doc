import {asArray, isPresent, NgDocEntityAnchor, NgDocPage} from '@ng-doc/core';
import * as fs from 'fs';
import * as path from 'path';
import {Observable, of} from 'rxjs';
import {map, tap} from 'rxjs/operators';
import {ObjectLiteralExpression} from 'ts-morph';

import {
	buildEntityKeyword,
	buildPlaygroundMetadata,
	editFileInRepoUrl,
	getPlaygroundById,
	getPlaygroundsExpression,
	getPlaygroundsIds,
} from '../../helpers';
import {NgDocBuildResult, NgDocEntityKeyword, NgDocPlaygroundMetadata} from '../../interfaces';
import {NgDocActions} from '../actions';
import {renderTemplate} from '../nunjucks';
import {NgDocEntity} from './abstractions/entity';
import {NgDocNavigationEntity} from './abstractions/navigation.entity';
import {CachedEntity, CachedFilesGetter} from './cache/decorators';
import {NgDocCategoryEntity} from './category.entity';
import {NgDocPageDemoEntity} from './page-demo.entity';
import {NgDocPagePlaygroundEntity} from './page-playground.entity';
import {fillIndexesPlugin, markdownToHtmlPlugin, postProcessHtmlPlugin, processHtmlPlugin} from './plugins';

@CachedEntity()
export class NgDocPageEntity extends NgDocNavigationEntity<NgDocPage> {
	playgroundsExpression: ObjectLiteralExpression | undefined;
	playgroundMetadata: Record<string, NgDocPlaygroundMetadata> = {};

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
	}

	override childrenGenerator(): Observable<NgDocEntity[]> {
		return of([
			new NgDocPageDemoEntity(this.store, this.cache, this.context, this),
			new NgDocPagePlaygroundEntity(this.store, this.cache, this.context, this),
		]);
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

					this.updatePlaygroundMetadata();
				}
			}),
			tap({
				error: (e: Error) => this.errors.push(e),
			}),
		);
	}

	build(): Observable<NgDocBuildResult<string, this>> {
		const result: string = renderTemplate(this.target!.mdFile, {
			scope: this.sourceFileFolder,
			context: {
				NgDocPage: this.target,
				NgDocActions: new NgDocActions(this),
			},
			dependenciesStore: this.dependencies,
			filters: false,
		});

		return of({
			result,
			entity: this,
			toBuilderOutput: async (content: string) => ({
				content,
				filePath: this.modulePath,
			}),
			postBuildPlugins: [
				markdownToHtmlPlugin(),
				processHtmlPlugin(),
			],
			postProcessPlugins: [
				postProcessHtmlPlugin(),
				fillIndexesPlugin(),
			]
		});
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
}
