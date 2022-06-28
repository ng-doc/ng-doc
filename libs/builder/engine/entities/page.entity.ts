import * as fs from 'fs';
import * as path from 'path';
import {forkJoin, Observable, of} from 'rxjs';
import {catchError, map, tap} from 'rxjs/operators';
import {Project, SourceFile} from 'ts-morph';

import {asArray, isPresent, uniqueName} from '../../helpers';
import {isPageDependencyEntity} from '../../helpers/is-page-dependency-entity';
import {NgDocBuildedOutput, NgDocBuilderContext, NgDocPage} from '../../interfaces';
import {NgDocPageEnv, NgDocPageModuleEnv} from '../../templates-env';
import {NgDocActions} from '../actions';
import {NgDocEntityStore} from '../entity-store';
import {NgDocRenderer} from '../renderer';
import {CACHE_PATH, PAGE_DEPENDENCIES_NAME, RENDERED_PAGE_NAME} from '../variables';
import {NgDocAngularEntity} from './abstractions/angular.entity';
import {NgDocEntity} from './abstractions/entity';
import {NgDocCategoryEntity} from './category.entity';
import {NgDocPageDependenciesEntity} from './page-dependencies.entity';

export class NgDocPageEntity extends NgDocAngularEntity<NgDocPage> {
	override moduleName: string = uniqueName(`NgDocGeneratedPageModule`);
	componentName: string = uniqueName(`NgDocGeneratedPageComponent`);

	override parent?: NgDocCategoryEntity;

	constructor(
		override readonly project: Project,
		override readonly sourceFile: SourceFile,
		protected override readonly context: NgDocBuilderContext,
		protected override readonly entityStore: NgDocEntityStore,
	) {
		super(project, sourceFile, context, entityStore);
	}

	override get route(): string {
		const folderName: string = path.basename(path.dirname(this.sourceFile.getFilePath()));

		return this.target?.route ?? folderName;
	}

	/**
	 * Returns full url from the root
	 *
	 * @type {string}
	 */
	get url(): string {
		return `${this.parent ? this.parent.url + '/' : ''}${this.route}`;
	}

	override get isRoot(): boolean {
		return !this.target?.category;
	}

	override get title(): string {
		return this.target?.title ?? '';
	}

	get scope(): string {
		return this.target?.scope?.replace(CACHE_PATH, '') ?? this.parent?.scope ?? this.context.context.workspaceRoot;
	}

	override get order(): number | undefined {
		return this.target?.order;
	}

	override get moduleFileName(): string {
		return `ng-doc-page.module.ts`;
	}

	get mdPath(): string {
		return path.join(this.sourceFileFolder, this.target?.mdFile ?? '');
	}

	get builtPagePath(): string {
		return path.relative(
			this.context.context.workspaceRoot,
			path.join(this.folderPathInGenerated, RENDERED_PAGE_NAME),
		);
	}

	override get buildCandidates(): NgDocEntity[] {
		return this.parentEntities;
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
		const dependencies: NgDocPageDependenciesEntity | undefined = asArray(this.children.values()).filter(
			isPageDependencyEntity,
		)[0];

		return dependencies ? dependencies.componentAssetsInGeneratedImport : undefined;
	}

	protected override update(): Observable<void> {
		return super.update().pipe(
			tap(() => {
				if (!isPresent(this.target?.mdFile) || !fs.existsSync(this.mdPath)) {
					throw new Error(
						`Failed to load ${this.sourceFile.getFilePath()}. Make sure that you define mdFile property correctly and .md file exists.`,
					);
				}

				if (!this.title) {
					throw new Error(
						`Failed to load ${this.sourceFile.getFilePath()}. Make sure that you have a title property.`,
					);
				}

				this.parent = this.getParentFromCategory();
			}),
			catchError((error: unknown) => {
				this.readyToBuild = false;
				this.context.context.logger.error(`\n${String(error)}`);

				return of(void 0);
			}),
		);
	}

	override build(): Observable<NgDocBuildedOutput[]> {
		return this.isReadyToBuild ? forkJoin([this.buildPage(), this.buildModule()]) : of([]);
	}

	private buildModule(): Observable<NgDocBuildedOutput> {
		if (this.target) {
			const renderer: NgDocRenderer<NgDocPageModuleEnv> = new NgDocRenderer<NgDocPageModuleEnv>({page: this});

			return renderer
				.render('page.module.ts.nunj')
				.pipe(map((output: string) => ({output, filePath: this.modulePathInGenerated})));
		}
		return of();
	}

	private buildPage(): Observable<NgDocBuildedOutput> {
		this.dependencies.clear();

		if (this.target) {
			this.dependencies.add(this.mdPath);

			const renderer: NgDocRenderer<NgDocPageEnv> = new NgDocRenderer<NgDocPageEnv>({
				NgDocPage: this.target,
				NgDocActions: new NgDocActions(this),
			});

			return renderer
				.render(this.target?.mdFile, {scope: this.sourceFileFolder})
				.pipe(map((output: string) => ({output, filePath: this.builtPagePath})));
		}
		return of();
	}
}
