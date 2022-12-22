import {humanizeDeclarationName, NgDocApi, NgDocApiList} from '@ng-doc/core';
import * as path from 'path';
import {forkJoin, from, Observable, of} from 'rxjs';
import {catchError, map, switchMap, tap} from 'rxjs/operators';

import {generateApiEntities, isApiPageEntity, isApiScopeEntity, slash, uniqueName} from '../../helpers';
import {NgDocBuiltOutput} from '../../interfaces';
import {NgDocApiModuleEnv} from '../../templates-env/api.module.env';
import {NgDocRenderer} from '../renderer';
import {NgDocEntity} from './abstractions/entity';
import {NgDocNavigationEntity} from './abstractions/navigation.entity';
import {NgDocApiPageEntity} from './api-page.entity';
import {NgDocApiScopeEntity} from './api-scope.entity';
import {NgDocCategoryEntity} from './category.entity';

export class NgDocApiEntity extends NgDocNavigationEntity<NgDocApi> {
	override moduleName: string = uniqueName(`NgDocGeneratedApiListModule`);
	componentName: string = uniqueName(`NgDocGeneratedApiListComponent`);
	override moduleFileName: string = `${uniqueName('ng-doc-api-list')}.module.ts`;
	override parent?: NgDocCategoryEntity;

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

	override get buildCandidates(): NgDocEntity[] {
		return this.parentEntities;
	}

	override get folderPath(): string {
		return path.join(this.context.apiPath, 'api');
	}

	override get keywords(): string[] {
		return [];
	}

	override childrenGenerator(): Observable<NgDocEntity[]> {
		return this.emit().pipe(
			switchMap(() => from(this.sourceFile.getProject().emit())),
			switchMap(() => this.update()),
			map(() => generateApiEntities(this)),
		);
	}

	override update(): Observable<void> {
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

	protected override build(): Observable<NgDocBuiltOutput[]> {
		return this.isReadyForBuild ? forkJoin([this.buildModule(), this.buildApiList()]) : of([]);
	}

	private buildModule(): Observable<NgDocBuiltOutput> {
		if (this.target) {
			const renderer: NgDocRenderer<NgDocApiModuleEnv> = new NgDocRenderer<NgDocApiModuleEnv>(this.builder, {
				api: this,
			});

			return renderer
				.render('./api.module.ts.nunj')
				.pipe(map((output: string) => ({content: output, filePath: this.modulePath})));
		}
		return of();
	}

	private buildApiList(): Observable<NgDocBuiltOutput> {
		const apiItems: NgDocApiList[] = this.children.filter(isApiScopeEntity).map((scope: NgDocApiScopeEntity) => ({
			title: scope.title,
			items: scope.children.filter(isApiPageEntity).map((page: NgDocApiPageEntity) => ({
				route: slash(path.join(scope.route, page.route)),
				type: humanizeDeclarationName(page.declaration?.getKindName() ?? ''),
				name: page.declaration?.getName() ?? '',
			})),
		}));

		return of({
			content: JSON.stringify(apiItems, undefined, 2),
			filePath: path.join(this.folderPath, 'ng-doc.api-list.json'),
		});
	}
}