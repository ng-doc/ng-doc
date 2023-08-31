import { asArray, NgDocEntityAnchor } from '@ng-doc/core';
import * as path from 'path';
import { Observable, of } from 'rxjs';
import { SourceFile } from 'ts-morph';

import {
	buildEntityKeyword,
	declarationFolderName,
	editFileInRepoUrl,
	isSupportedDeclaration,
	slash,
	uniqueName,
	viewFileInRepoUrl,
} from '../../helpers';
import { NgDocBuilderContext, NgDocBuildResult, NgDocEntityKeyword } from '../../interfaces';
import { NgDocSupportedDeclarations } from '../../types';
import { NgDocEntityStore } from '../entity-store';
import { renderTemplate } from '../nunjucks';
import { NgDocEntity } from './abstractions/entity';
import { NgDocRouteEntity } from './abstractions/route.entity';
import { NgDocApiScopeEntity } from './api-scope.entity';
import { CachedEntity, NgDocCache } from './cache';
import { fillIndexesPlugin, postProcessHtmlPlugin, processHtmlPlugin } from './plugins';

@CachedEntity()
export class NgDocApiPageEntity extends NgDocRouteEntity<never> {
	declaration?: NgDocSupportedDeclarations;

	override readonly physical: boolean = false;
	override readonly id: string = uniqueName(`${this.sourceFilePath}#${this.declarationName}`);
	override folderName: string = '';

	constructor(
		override readonly store: NgDocEntityStore,
		override readonly cache: NgDocCache,
		override readonly context: NgDocBuilderContext,
		override readonly sourceFile: SourceFile,
		override parent: NgDocApiScopeEntity,
		readonly declarationName: string,
		readonly index: number,
	) {
		super(store, cache, context, sourceFile);

		this.updateDeclaration();
	}

	override get isRoot(): boolean {
		// always false, api pages are not rooted
		return false;
	}

	override get route(): string {
		return this.declaration
			? slash(
					path.join(
						declarationFolderName(this.declaration),
						this.declarationName + (this.index ? this.index : ''),
					),
			  )
			: '';
	}

	protected override refreshImpl(): Observable<void> {
		/**
		 * Just refresh source file, we don't need to emit it
		 */
		this.sourceFile.refreshFromFileSystemSync();
		this.updateDeclaration();

		return of(void 0);
	}

	override get title(): string {
		return this.declarationName;
	}

	override get editSourceFileUrl(): string | undefined {
		if (this.context.config.repoConfig) {
			return editFileInRepoUrl(
				this.context.config.repoConfig,
				this.sourceFilePath,
				this.parent.route.toLowerCase(),
				this.declaration?.getStartLineNumber(true),
			);
		}
		return undefined;
	}

	override get viewSourceFileUrl(): string | undefined {
		if (this.context.config.repoConfig) {
			return viewFileInRepoUrl(
				this.context.config.repoConfig,
				this.sourceFilePath,
				this.declaration?.getStartLineNumber(true),
			);
		}
		return undefined;
	}

	override get folderPath(): string {
		return path.join(this.parent.folderPath, this.route);
	}

	override get buildCandidates(): NgDocEntity[] {
		return [];
	}

	override get keywords(): NgDocEntityKeyword[] {
		return [
			{
				key: this.declarationName,
				title: this.declarationName,
				path: this.fullRoute,
			},
		].concat(
			this.anchors.map((anchor: NgDocEntityAnchor) =>
				buildEntityKeyword(this.declarationName, this.declarationName, this.fullRoute, anchor),
			),
		);
	}

	override compile(): Observable<void> {
		return of(void 0);
	}

	protected override loadImpl(): Observable<void> {
		return of(void 0);
	}

	override build(): Observable<NgDocBuildResult<string, this>> {
		if (this.parent.target) {
			const result = renderTemplate('./api-page-content.html.nunj', {
				context: {
					declaration: this.declaration,
					scope: this.parent.target,
				},
			});

			return of({
				result,
				entity: this,
				toBuilderOutput: async (content: string) => ({
					content: renderTemplate('./api-page.ts.nunj', {
						context: {
							page: this,
							pageContent: content,
						},
					}),
					filePath: this.modulePath,
				}),
				postBuildPlugins: [processHtmlPlugin()],
				postProcessPlugins: [postProcessHtmlPlugin(), fillIndexesPlugin()],
			});
		}

		throw new Error(`The entity "${this.id}" is not loaded.`);
	}

	private updateDeclaration(): asserts this is this & { declaration: NgDocSupportedDeclarations } {
		const declarations: NgDocSupportedDeclarations[] = [
			...asArray(this.sourceFile.getExportedDeclarations().get(this.declarationName)),
			...asArray(this.sourceFile.getExportedDeclarations().get('default')),
		].filter(isSupportedDeclaration);

		this.declaration = declarations.find(
			(declaration: NgDocSupportedDeclarations) => declaration.getName() === this.declarationName,
		);

		if (!this.declaration) {
			this.destroy();
		}
	}
}
