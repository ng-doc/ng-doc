import {asArray, isPresent} from '@ng-doc/core';
import * as path from 'path';
import {forkJoin, Observable, of} from 'rxjs';
import {catchError, map} from 'rxjs/operators';
import {SourceFile} from 'ts-morph';

import {declarationFolderName, slash, uniqueName} from '../../helpers';
import {isSupportedDeclaration} from '../../helpers/is-supported-declaration';
import {NgDocBuilderContext, NgDocBuiltOutput} from '../../interfaces';
import {NgDocApiPageEnv} from '../../templates-env/api-page.env';
import {NgDocApiPageModuleEnv} from '../../templates-env/api-page.module.env';
import {NgDocSupportedDeclarations} from '../../types/supported-declarations';
import {NgDocBuilder} from '../builder';
import {NgDocRenderer} from '../renderer';
import {RENDERED_PAGE_NAME} from '../variables';
import {NgDocEntity} from './abstractions/entity';
import {NgDocRouteEntity} from './abstractions/route.entity';
import {NgDocApiScopeEntity} from './api-scope.entity';

export class NgDocApiPageEntity extends NgDocRouteEntity<never> {
	override folderName: string = '';
	override moduleName: string = uniqueName(`NgDocGeneratedApiPageModule`);
	componentName: string = uniqueName(`NgDocGeneratedApiPageComponent`);
	override moduleFileName: string = `${uniqueName('ng-doc-api-page')}.module.ts`;
	protected override readyToBuild: boolean = true;
	declaration?: NgDocSupportedDeclarations;
	override id: string = uniqueName(`${this.sourceFilePath}}#${this.declarationName}`);

	constructor(
		override readonly builder: NgDocBuilder,
		override readonly sourceFile: SourceFile,
		override readonly context: NgDocBuilderContext,
		override parent: NgDocApiScopeEntity,
		readonly declarationName: string,
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
			? slash(path.join(declarationFolderName(this.declaration), this.declaration?.getSymbol()?.getName() ?? ''))
			: '';
	}

	override emit() {
		/**
		 * Just refresh source file, we don't need to emit it
		 */
		this.sourceFile.refreshFromFileSystemSync();
	}

	override get title(): string {
		return this.declarationName;
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

	get builtPagePath(): string {
		return slash(path.relative(this.context.context.workspaceRoot, path.join(this.folderPath, RENDERED_PAGE_NAME)));
	}

	override init(): Observable<void> {
		return of(void 0);
	}

	override update(): Observable<void> {
		this.updateDeclaration();

		return of(void 0);
	}

	protected override build(): Observable<NgDocBuiltOutput[]> {
		return this.isReadyForBuild
			? forkJoin([this.buildPage(), this.buildModule()]).pipe(
					map((output: Array<NgDocBuiltOutput | null>) => output.filter(isPresent)),
			  )
			: of([]);
	}

	private buildModule(): Observable<NgDocBuiltOutput> {
		const renderer: NgDocRenderer<NgDocApiPageModuleEnv> = new NgDocRenderer<NgDocApiPageModuleEnv>(this.builder, {
			page: this,
		});

		return renderer
			.render('api-page.module.ts.nunj')
			.pipe(map((output: string) => ({content: output, filePath: this.modulePath})));
	}

	private buildPage(): Observable<NgDocBuiltOutput | null> {
		if (this.declaration) {
			const renderer: NgDocRenderer<NgDocApiPageEnv> = new NgDocRenderer<NgDocApiPageEnv>(this.builder, {
				declaration: this.declaration,
				scope: this.parent.target,
			});

			return renderer.render('api-page.html.nunj').pipe(
				map((output: string) => ({content: output, filePath: this.builtPagePath})),
				catchError((error: unknown) => {
					this.logger.error(
						`\nError happened while processing Api Page for entity "${this.declaration
							?.getSymbol()
							?.getName()}": ${error}"`,
					);
					return of(null);
				}),
			);
		}
		return of(null);
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
