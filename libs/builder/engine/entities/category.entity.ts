import * as path from 'path';
import {forkJoin, Observable, of} from 'rxjs';
import {catchError, map, tap} from 'rxjs/operators';
import {Project, SourceFile} from 'ts-morph';

import {asArray, isCategoryEntity, isPageEntity, uniqueName} from '../../helpers';
import {NgDocBuildedOutput, NgDocBuilderContext, NgDocCategory} from '../../interfaces';
import {NgDocCategoryModuleEnv} from '../../templates-env';
import {NgDocEntityStore} from '../entity-store';
import {NgDocRenderer} from '../renderer';
import {CACHE_PATH} from '../variables';
import {NgDocAngularEntity} from './abstractions/angular.entity';
import {NgDocEntity} from './abstractions/entity';
import {NgDocPageEntity} from './page.entity';

export class NgDocCategoryEntity extends NgDocAngularEntity<NgDocCategory> {
	moduleName: string = uniqueName(`NgDocGeneratedCategoryModule`);
	parent?: NgDocCategoryEntity;

	constructor(
		override readonly project: Project,
		override readonly sourceFile: SourceFile,
		protected override readonly context: NgDocBuilderContext,
		protected override readonly entityStore: NgDocEntityStore,
	) {
		super(project, sourceFile, context, entityStore);
	}

	get route(): string {
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

	get isRoot(): boolean {
		return !this.target?.category;
	}

	get scope(): string {
		return this.target?.scope?.replace(CACHE_PATH, '') ?? this.parent?.scope ?? this.context.context.workspaceRoot;
	}

	get order(): number | undefined {
		return this.target?.order;
	}

	get pages(): NgDocPageEntity[] {
		return asArray(this.children.values()).filter(isPageEntity);
	}

	get categories(): NgDocCategoryEntity[] {
		return asArray(this.children.values()).filter(isCategoryEntity);
	}

	get moduleFileName(): string {
		return `ng-doc-category.module.ts`;
	}

	get title(): string {
		return this.target?.title ?? '';
	}

	get buildCandidates(): NgDocEntity[] {
		return this.childEntities;
	}

	get expandable(): boolean {
		return this.target?.expandable ?? true;
	}

	get expanded(): boolean {
		return this.target?.expanded ?? !this.isRoot;
	}

	protected override update(): Observable<void> {
		return super.update().pipe(
			tap(() => {
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

	build(): Observable<NgDocBuildedOutput[]> {
		return this.isReadyToBuild ? forkJoin([this.buildModule()]) : of([]);
	}

	private buildModule(): Observable<NgDocBuildedOutput> {
		if (this.target) {
			const renderer: NgDocRenderer<NgDocCategoryModuleEnv> = new NgDocRenderer<NgDocCategoryModuleEnv>({
				category: this,
			});

			return renderer
				.render('ng-doc.category.module.ts.nunj')
				.pipe(map((output: string) => ({output, filePath: this.modulePathInGenerated})));
		}
		return of();
	}
}
