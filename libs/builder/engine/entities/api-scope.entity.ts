import * as glob from 'glob';
import {Observable, of} from 'rxjs';
import {ExportedDeclarations, Project, SourceFile} from 'ts-morph';

import {asArray, isNotExcludedPath, isPageEntity, uniqueName} from '../../helpers';
import {NgDocApiScope, NgDocBuildedOutput, NgDocBuilderContext} from '../../interfaces';
import {NgDocEntityStore} from '../entity-store';
import {NgDocAngularEntity} from './abstractions/angular.entity';
import {NgDocEntity} from './abstractions/entity';
import {NgDocApiEntity} from './api.entity';
import {NgDocApiPageEntity} from './api-page.entity';
import {NgDocPageEntity} from './page.entity';

export class NgDocApiScopeEntity extends NgDocAngularEntity<NgDocApiScope> {
	moduleName: string = uniqueName(`NgDocGeneratedApiScopeCategoryModule`);

	constructor(
		override readonly project: Project,
		override readonly sourceFile: SourceFile,
		protected override readonly context: NgDocBuilderContext,
		protected override readonly entityStore: NgDocEntityStore,
		public override parent: NgDocApiEntity,
		protected override target: NgDocApiScope,
	) {
		super(project, sourceFile, context, entityStore);
	}

	get route(): string {
		return this.target.route;
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
		return false;
	}

	get order(): number | undefined {
		return this.target?.order;
	}

	get pages(): NgDocPageEntity[] {
		return asArray(this.children.values()).filter(isPageEntity);
	}

	get moduleFileName(): string {
		return `ng-doc-scope-category.module.ts`;
	}

	get title(): string {
		return this.target.name;
	}

	get buildCandidates(): NgDocEntity[] {
		return this.childEntities;
	}

	protected override update(): Observable<void> {
		asArray(this.target.include).forEach((include: string) =>
			this.project
				.addSourceFilesAtPaths(
					glob.sync(include).filter((p: string) => isNotExcludedPath(p, asArray(this.target.exclude))),
				)
				.forEach((sourceFile: SourceFile) =>
					asArray(sourceFile.getExportedDeclarations().values()).forEach(
						(exportedDeclarations: ExportedDeclarations[]) =>
							exportedDeclarations.forEach(
								(declaration: ExportedDeclarations) =>
									new NgDocApiPageEntity(
										this.project,
										sourceFile,
										this.context,
										this.entityStore,
										declaration,
									),
							),
					),
				),
		);

		return of(void 0);
	}

	build(): Observable<NgDocBuildedOutput[]> {
		return of([]);
	}

	override destroy(): void {
		this.entityStore.remove(...this.childEntities);

		super.destroy();
	}

	private buildModule(): Observable<NgDocBuildedOutput> {
		return of();
	}
}
