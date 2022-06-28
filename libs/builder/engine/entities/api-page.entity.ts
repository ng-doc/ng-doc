import * as path from 'path';
import {forkJoin, Observable, of} from 'rxjs';
import {map} from 'rxjs/operators';
import {ExportedDeclarations, Project, SourceFile} from 'ts-morph';

import {uniqueName} from '../../helpers';
import {NgDocBuildedOutput, NgDocBuilderContext} from '../../interfaces';
import {NgDocApiPageEnv} from '../../templates-env/api-page.env';
import {NgDocApiPageModuleEnv} from '../../templates-env/api-page.module.env';
import {NgDocEntityStore} from '../entity-store';
import {NgDocRenderer} from '../renderer';
import {RENDERED_PAGE_NAME} from '../variables';
import {NgDocEntity} from './abstractions/entity';
import {NgDocApiScopeEntity} from './api-scope.entity';

export class NgDocApiPageEntity extends NgDocEntity {
	moduleName: string = uniqueName(`NgDocGeneratedApiPageModule`);
	componentName: string = uniqueName(`NgDocGeneratedApiPageComponent`);
	protected override readyToBuild: boolean = true;

	constructor(
		override readonly project: Project,
		override readonly sourceFile: SourceFile,
		protected override readonly context: NgDocBuilderContext,
		protected override readonly entityStore: NgDocEntityStore,
		readonly parent: NgDocApiScopeEntity,
		protected readonly declaration: ExportedDeclarations,
	) {
		super(project, sourceFile, context, entityStore);
	}

	override get storeKey(): string {
		return `${super.sourceFilePath}#${this.componentName}`;
	}

	override get isRoot(): boolean {
		// always false, api pages are not rooted
		return false;
	}

	get route(): string {
		return this.declaration.getSymbol()?.getName() ?? '';
	}

	override get folderPathInGenerated(): string {
		return path.join(this.parent.folderPathInGenerated, this.route);
	}

	override get buildCandidates(): NgDocEntity[] {
		return [];
	}

	get moduleFileName(): string {
		return `ng-doc-api-page.module.ts`;
	}

	/**
	 * Returns paths to the module in generated folder
	 *
	 * @type {string}
	 */
	get modulePathInGenerated(): string {
		return path.join(this.folderPathInGenerated, this.moduleFileName);
	}

	/**
	 * Returns relative paths to the module in generated folder that could be used for import
	 *
	 * @type {string}
	 */
	get moduleImportPath(): string {
		return path.relative(this.context.context.workspaceRoot, this.modulePathInGenerated).replace(/.ts$/, '');
	}

	get builtPagePath(): string {
		return path.relative(
			this.context.context.workspaceRoot,
			path.join(this.folderPathInGenerated, RENDERED_PAGE_NAME),
		);
	}

	override init(): Observable<void> {
		return of(void 0);
	}

	protected override update(): Observable<void> {
		return of(void 0);
	}

	override build(): Observable<NgDocBuildedOutput[]> {
		return this.isReadyToBuild ? forkJoin([this.buildPage(), this.buildModule()]) : of([]);
	}

	private buildModule(): Observable<NgDocBuildedOutput> {
		const renderer: NgDocRenderer<NgDocApiPageModuleEnv> = new NgDocRenderer<NgDocApiPageModuleEnv>({page: this});

		return renderer
			.render('api-page.module.ts.nunj')
			.pipe(map((output: string) => ({output, filePath: this.modulePathInGenerated})));
	}

	private buildPage(): Observable<NgDocBuildedOutput> {
		const renderer: NgDocRenderer<NgDocApiPageEnv> = new NgDocRenderer<NgDocApiPageEnv>({
			declaration: this.declaration,
		});

		return renderer
			.render('api-page.md.nunj')
			.pipe(map((output: string) => ({output, filePath: this.builtPagePath})));
	}
}
