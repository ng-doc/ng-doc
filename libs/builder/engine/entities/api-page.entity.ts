import * as path from 'path';
import {forkJoin, Observable, of} from 'rxjs';
import {catchError, map} from 'rxjs/operators';
import {Node, Project, SourceFile} from 'ts-morph';

import {declarationFolderName, isPresent, uniqueName} from '../../helpers';
import {NgDocBuildedOutput, NgDocBuilderContext} from '../../interfaces';
import {NgDocApiPageEnv} from '../../templates-env/api-page.env';
import {NgDocApiPageModuleEnv} from '../../templates-env/api-page.module.env';
import {NgDocEntityStore} from '../entity-store';
import {NgDocRenderer} from '../renderer';
import {RENDERED_PAGE_NAME} from '../variables';
import {NgDocEntity} from './abstractions/entity';
import {NgDocApiScopeEntity} from './api-scope.entity';
import {isSupportedDeclaration} from './functions/is-supported-declaration';
import {NgDocSupportedDeclarations} from './types/supported-declarations';

export class NgDocApiPageEntity extends NgDocEntity {
	moduleName: string = uniqueName(`NgDocGeneratedApiPageModule`);
	componentName: string = uniqueName(`NgDocGeneratedApiPageComponent`);
	protected override readyToBuild: boolean = true;
	private declaration?: NgDocSupportedDeclarations;

	constructor(
		override readonly project: Project,
		override readonly sourceFile: SourceFile,
		protected override readonly context: NgDocBuilderContext,
		protected override readonly entityStore: NgDocEntityStore,
		readonly parent: NgDocApiScopeEntity,
		protected readonly declarationName: string,
	) {
		super(project, sourceFile, context, entityStore);

		this.updateDeclaration();
	}

	override get storeKey(): string {
		return `${super.sourceFilePath}#${this.componentName}`;
	}

	override get isRoot(): boolean {
		// always false, api pages are not rooted
		return false;
	}

	get route(): string {
		return this.declaration
			? path.join(declarationFolderName(this.declaration), this.declaration?.getSymbol()?.getName() ?? '')
			: '';
	}

	override get folderPath(): string {
		return path.join(this.parent.folderPath, this.route);
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
	get modulePath(): string {
		return path.join(this.folderPath, this.moduleFileName);
	}

	/**
	 * Returns relative paths to the module in generated folder that could be used for import
	 *
	 * @type {string}
	 */
	get moduleImport(): string {
		return path.relative(this.context.context.workspaceRoot, this.modulePath).replace(/.ts$/, '');
	}

	get builtPagePath(): string {
		return path.relative(this.context.context.workspaceRoot, path.join(this.folderPath, RENDERED_PAGE_NAME));
	}

	override init(): Observable<void> {
		return of(void 0);
	}

	protected override update(): Observable<void> {
		this.sourceFile.refreshFromFileSystemSync();
		this.updateDeclaration();

		return of(void 0);
	}

	override build(): Observable<NgDocBuildedOutput[]> {
		return this.isReadyToBuild
			? forkJoin([this.buildPage(), this.buildModule()]).pipe(
					map((output: Array<NgDocBuildedOutput | null>) => output.filter(isPresent)),
			  )
			: of([]);
	}

	private buildModule(): Observable<NgDocBuildedOutput> {
		const renderer: NgDocRenderer<NgDocApiPageModuleEnv> = new NgDocRenderer<NgDocApiPageModuleEnv>({page: this});

		return renderer
			.render('api-page.module.ts.nunj')
			.pipe(map((output: string) => ({output, filePath: this.modulePath})));
	}

	private buildPage(): Observable<NgDocBuildedOutput | null> {
		if (this.declaration) {
			const renderer: NgDocRenderer<NgDocApiPageEnv> = new NgDocRenderer<NgDocApiPageEnv>({
				Node,
				declaration: this.declaration,
				scope: this.parent.target
			});

			return renderer.render('api-page.md.nunj').pipe(
				map((output: string) => ({output, filePath: this.builtPagePath})),
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
		const declarations: NgDocSupportedDeclarations[] | undefined = this.sourceFile
			.getExportedDeclarations()
			.get(this.declarationName)
			?.filter(isSupportedDeclaration);


		this.declaration = (declarations && declarations[0]) ?? undefined;

		if (!this.declaration) {
			this.destroy();
		}
	}
}
