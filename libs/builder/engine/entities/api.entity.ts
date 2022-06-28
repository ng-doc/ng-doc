import * as path from 'path';
import {Observable, of} from 'rxjs';
import {catchError, tap} from 'rxjs/operators';
import {Project, SourceFile} from 'ts-morph';

import {uniqueName} from '../../helpers';
import {NgDocApi, NgDocApiScope, NgDocBuildedOutput, NgDocBuilderContext} from '../../interfaces';
import {NgDocEntityStore} from '../entity-store';
import {NgDocAngularEntity} from './abstractions/angular.entity';
import {NgDocEntity} from './abstractions/entity';
import {NgDocApiScopeEntity} from './api-scope.entity';
import {NgDocCategoryEntity} from './category.entity';

export class NgDocApiEntity extends NgDocAngularEntity<NgDocApi> {
	moduleName: string = uniqueName(`NgDocGeneratedApiPageModule`);
	componentName: string = uniqueName(`NgDocGeneratedApiPageComponent`);
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

	get title(): string {
		return this.target?.title ?? '';
	}

	get order(): number | undefined {
		return this.target?.order;
	}

	get moduleFileName(): string {
		return `ng-doc-api-page.module.ts`;
	}

	get buildCandidates(): NgDocEntity[] {
		return this.parentEntities;
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

	build(): Observable<NgDocBuildedOutput[]> {
		return of([]);
	}

	private buildModule(): Observable<NgDocBuildedOutput> {
		return of();
	}

	private buildPage(): Observable<NgDocBuildedOutput> {
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
