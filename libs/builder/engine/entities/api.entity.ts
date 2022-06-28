import * as path from 'path';
import {forkJoin, Observable, of} from 'rxjs';
import {catchError, map, tap} from 'rxjs/operators';
import {Project, SourceFile} from 'ts-morph';

import {uniqueName} from '../../helpers';
import {NgDocApi, NgDocApiScope, NgDocBuildedOutput, NgDocBuilderContext} from '../../interfaces';
import {NgDocApiModuleEnv} from '../../templates-env/api.module.env';
import {NgDocEntityStore} from '../entity-store';
import {NgDocRenderer} from '../renderer';
import {GENERATED_MODULES_PATH} from '../variables';
import {NgDocAngularEntity} from './abstractions/angular.entity';
import {NgDocEntity} from './abstractions/entity';
import {NgDocApiScopeEntity} from './api-scope.entity';
import {NgDocCategoryEntity} from './category.entity';

export class NgDocApiEntity extends NgDocAngularEntity<NgDocApi> {
	override moduleName: string = uniqueName(`NgDocGeneratedApiListModule`);
	componentName: string = uniqueName(`NgDocGeneratedApiListComponent`);
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
		return this.target?.route ?? 'api';
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

	override get order(): number | undefined {
		return this.target?.order;
	}

	override get moduleFileName(): string {
		return `ng-doc-api-list.module.ts`;
	}

	override get buildCandidates(): NgDocEntity[] {
		return this.parentEntities;
	}

	override get folderPathInGenerated(): string {
		return path.join(GENERATED_MODULES_PATH, 'api');
	}

	override init(): Observable<void> {
		return this.update();
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
			tap(() => this.reloadScopes()),
			catchError((error: unknown) => {
				this.readyToBuild = false;
				this.context.context.logger.error(`\n${String(error)}`);

				return of(void 0);
			}),
		);
	}

	override build(): Observable<NgDocBuildedOutput[]> {
		return this.isReadyToBuild ? forkJoin([this.buildModule()]) : of([]);
	}

	private buildModule(): Observable<NgDocBuildedOutput> {
		if (this.target) {
			const renderer: NgDocRenderer<NgDocApiModuleEnv> = new NgDocRenderer<NgDocApiModuleEnv>({api: this});

			return renderer
				.render('api.module.ts.nunj')
				.pipe(map((output: string) => ({output, filePath: this.modulePathInGenerated})));
		}
		return of();
	}

	private reloadScopes(): void {
		this.children.forEach((child: NgDocEntity) => child.destroy());

		this.target?.scopes.forEach(
			(scope: NgDocApiScope) =>
				new NgDocApiScopeEntity(this.project, this.sourceFile, this.context, this.entityStore, this, scope),
		);
	}
}
