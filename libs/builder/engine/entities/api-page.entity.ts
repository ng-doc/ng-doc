import {asArray, isPresent, NgDocPageIndex} from '@ng-doc/core';
import * as path from 'path';
import {forkJoin, from, Observable, of} from 'rxjs';
import {map, mapTo, switchMap, tap} from 'rxjs/operators';
import {SourceFile} from 'ts-morph';

import {
	declarationFolderName,
	editFileInRepoUrl,
	getPageType,
	processHtml,
	slash,
	uniqueName,
	viewFileInRepoUrl,
} from '../../helpers';
import {isSupportedDeclaration} from '../../helpers';
import {buildIndexes} from '../../helpers/build-indexes';
import {NgDocBuilderContext, NgDocBuiltOutput} from '../../interfaces';
import {NgDocSupportedDeclarations} from '../../types';
import {NgDocBuilder} from '../builder';
import {renderTemplate} from '../nunjucks';
import {NgDocEntity} from './abstractions/entity';
import {NgDocRouteEntity} from './abstractions/route.entity';
import {NgDocApiScopeEntity} from './api-scope.entity';
import {CachedEntity} from './cache';

@CachedEntity()
export class NgDocApiPageEntity extends NgDocRouteEntity<never> {
	declaration?: NgDocSupportedDeclarations;

	override readonly physical: boolean = false;
	override readonly id: string = uniqueName(`${this.sourceFilePath}}#${this.declarationName}`);
	override folderName: string = '';
	protected override readyToBuild: boolean = true;

	constructor(
		override readonly builder: NgDocBuilder,
		override readonly sourceFile: SourceFile,
		override readonly context: NgDocBuilderContext,
		override parent: NgDocApiScopeEntity,
		readonly declarationName: string,
		readonly index: number,
	) {
		super(builder, sourceFile, context);

		this.updateDeclaration();
	}

	override get isRoot(): boolean {
		// always false, api pages are not rooted
		return false;
	}

	override get route(): string {
		return this.declaration
			? slash(path.join(declarationFolderName(this.declaration), this.declarationName + (this.index ? this.index : '')))
			: '';
	}

	override emit(): Observable<void> {
		/**
		 * Just refresh source file, we don't need to emit it
		 */

		return from(this.sourceFile.refreshFromFileSystem()).pipe(mapTo(void 0));
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

	override get keywords(): string[] {
		return [this.declarationName];
	}

	override update(): Observable<void> {
		this.updateDeclaration();

		return of(void 0);
	}

	protected override build(): Observable<NgDocBuiltOutput[]> {
		return this.isReadyForBuild
			? forkJoin([this.buildModule()]).pipe(map((output: Array<NgDocBuiltOutput | null>) => output.filter(isPresent)))
			: of([]);
	}

	private buildModule(): Observable<NgDocBuiltOutput> {
		const template: string = renderTemplate('./api-page.html.nunj', {
			context: {
				declaration: this.declaration,
				scope: this.parent.target,
			},
		});

		const page: Observable<string> = of(template).pipe(
			switchMap((output: string) => processHtml(this, output)),
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
			map((pageContent: string) =>
				renderTemplate('./api-page.module.ts.nunj', {
					context: {page: this, pageContent},
				}),
			),
			map((output: string) => ({content: output, filePath: this.modulePath})),
		);
	}

	private updateDeclaration(): asserts this is this & {declaration: NgDocSupportedDeclarations} {
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
