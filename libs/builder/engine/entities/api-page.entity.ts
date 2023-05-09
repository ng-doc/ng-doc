import {asArray, isPresent} from '@ng-doc/core';
import * as path from 'path';
import {forkJoin, from, Observable, of} from 'rxjs';
import {catchError, map, mapTo} from 'rxjs/operators';
import {SourceFile} from 'ts-morph';

import {declarationFolderName, editFileInRepoUrl, slash, uniqueName, viewFileInRepoUrl} from '../../helpers';
import {isSupportedDeclaration} from '../../helpers/is-supported-declaration';
import {NgDocBuilderContext, NgDocBuiltOutput} from '../../interfaces';
import {NgDocSupportedDeclarations} from '../../types/supported-declarations';
import {NgDocBuilder} from '../builder';
import {RENDERED_PAGE_NAME} from '../variables';
import {NgDocEntity} from './abstractions/entity';
import {NgDocRouteEntity} from './abstractions/route.entity';
import {NgDocApiScopeEntity} from './api-scope.entity';

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
			? slash(
					path.join(
						declarationFolderName(this.declaration),
						this.declarationName + (this.index ? this.index : ''),
					),
			  )
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
			? forkJoin([this.buildModule()]).pipe(
					map((output: Array<NgDocBuiltOutput | null>) => output.filter(isPresent)),
			  )
			: of([]);
	}

	private buildModule(): Observable<NgDocBuiltOutput> {
		return this.builder.renderer
			.render('./api-page.module.ts.nunj', {context: {page: this}})
			.pipe(map((output: string) => ({content: output, filePath: this.modulePath})));
	}

	pageContent(): string {
		if (this.declaration) {
			return this.builder.renderer
				.renderSync('./api-page.html.nunj', {
					context: {
						declaration: this.declaration,
						scope: this.parent.target,
					},
				})
		}

		return ''
	}

	private updateDeclaration(): asserts this is this & {declaration: NgDocSupportedDeclarations} {
		const declarations: NgDocSupportedDeclarations[] = [
			...asArray(this.sourceFile.getExportedDeclarations().get(this.declarationName)),
			...asArray(this.sourceFile.getExportedDeclarations().get('default')),
		].filter(isSupportedDeclaration);

		this.declaration = declarations.find(
			(declaration: NgDocSupportedDeclarations) => declaration.getName() === this.declarationName,
		);

		// Doesnr work?
		if (!this.declaration) {
			this.destroy();
		}
	}
}
