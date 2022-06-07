import * as fs from 'fs';
import * as path from 'path';
import {forkJoin, Observable, of} from 'rxjs';
import {map} from 'rxjs/operators';
import {SourceFile} from 'ts-morph';

import {asArray, isPresent, uniqueName} from '../../helpers';
import {NgDocBuildedOutput, NgDocBuilderContext, NgDocPage} from '../../interfaces';
import {NgDocPageEnv, NgDocPageModuleEnv} from '../../templates-env';
import {NgDocActions} from '../actions';
import {NgDocBuildableStore} from '../buildable-store';
import {NgDocRenderer} from '../renderer';
import {PAGE_DEPENDENCIES_NAME, RENDERED_PAGE_NAME} from '../variables';
import {NgDocAngularBuildable} from './angular-buildable';
import {NgDocBuildable} from './buildable';
import {NgDocCategoryPoint} from './category';
import {NgDocPageDependenciesPoint} from './page-dependencies';

export class NgDocPagePoint extends NgDocAngularBuildable<NgDocPage, NgDocCategoryPoint, NgDocPageDependenciesPoint> {
	moduleName: string = uniqueName(`NgDocGeneratedPageModule`);
	componentName: string = uniqueName(`NgDocGeneratedPageComponent`);
	templateDependencies: Set<string> = new Set();

	constructor(
		protected override readonly context: NgDocBuilderContext,
		protected override readonly buildables: NgDocBuildableStore,
		protected override readonly sourceFile: SourceFile,
	) {
		super(context, buildables, sourceFile);
	}

	get route(): string {
		const folderName: string = path.basename(path.dirname(this.sourceFile.getFilePath()));

		return this.compiled?.route ?? folderName;
	}

	get isRoot(): boolean {
		return !this.compiled?.category;
	}

	get title(): string {
		return this.compiled?.title ?? '';
	}

	get scope(): string {
		return this.compiled?.scope ?? this.parent?.scope ?? this.context.context.workspaceRoot;
	}

	get order(): number | undefined {
		return this.compiled?.order;
	}

	get moduleFileName(): string {
		return `ng-doc-page.module.ts`;
	}

	get mdPath(): string {
		return path.join(this.sourceFileFolder, this.compiled?.mdFile ?? '');
	}

	get builtPagePath(): string {
		return path.relative(
			this.context.context.workspaceRoot,
			path.join(this.folderPathInGenerated, RENDERED_PAGE_NAME),
		);
	}

	get buildCandidates(): NgDocBuildable[] {
		return this.parentBuildables;
	}

	get dependencies(): string[] {
		return [this.mdPath, ...asArray(this.templateDependencies)];
	}

	get assetsFolder(): string {
		return path.relative(this.context.context.workspaceRoot, path.join(this.folderPathInGenerated, 'assets'));
	}

	get pageDependenciesFile(): string | undefined {
		const dependenciesPath: string = path.join(this.sourceFileFolder, PAGE_DEPENDENCIES_NAME);

		return fs.existsSync(dependenciesPath) ? dependenciesPath : undefined;
	}

	get pageDependenciesImport(): string | undefined {
		return this.pageDependenciesFile ? this.pageDependenciesFile.replace(/.ts$/, '') : undefined;
	}

	get componentsAssets(): string | undefined {
		const dependencies: NgDocPageDependenciesPoint | undefined = asArray(this.children.values())[0];

		return dependencies ? dependencies.componentAssetsInGeneratedImport : undefined;
	}

	override update(): void {
		try {
			super.update();
			this.parent?.addChild(this);

			if (!isPresent(this.compiled?.mdFile) || !fs.existsSync(this.mdPath)) {
				throw new Error(
					`Failed to load ${this.sourceFile.getFilePath()}. Make sure that you define mdFile property correctly and .md file exists.`,
				);
			}
		} catch (error: unknown) {
			this.readyToBuild = false;
			this.context.context.logger.error(`\n${String(error)}`);
		}
	}

	build(): Observable<NgDocBuildedOutput[]> {
		return this.isReadyToBuild ? forkJoin([this.buildPage(), this.buildModule()]) : of([]);
	}

	private buildModule(): Observable<NgDocBuildedOutput> {
		if (this.compiled) {
			const renderer: NgDocRenderer<NgDocPageModuleEnv> = new NgDocRenderer<NgDocPageModuleEnv>({page: this});

			return renderer
				.render('ng-doc.page.module.ts.nunj')
				.pipe(map((output: string) => ({output, filePath: this.modulePathInGenerated})));
		}
		return of();
	}

	private buildPage(): Observable<NgDocBuildedOutput> {
		if (this.compiled) {
			this.templateDependencies.clear();

			const renderer: NgDocRenderer<NgDocPageEnv> = new NgDocRenderer<NgDocPageEnv>({
				ngDocPage: this.compiled,
				ngDocActions: new NgDocActions(this),
			});

			return renderer
				.render(this.mdPath, {scope: this.scope})
				.pipe(map((output: string) => ({output, filePath: this.builtPagePath})));
		}
		return of();
	}
}
