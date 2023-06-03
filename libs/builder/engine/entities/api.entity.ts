import {NgDocApi, NgDocApiList} from '@ng-doc/core';
import * as path from 'path';
import {forkJoin, Observable, of} from 'rxjs';
import {map, switchMap, tap} from 'rxjs/operators';

import {
	buildFileEntity,
	generateApiEntities,
	getKindType,
	isApiPageEntity,
	isApiScopeEntity,
	slash,
	uniqueName,
} from '../../helpers';
import {NgDocBuiltOutput} from '../../interfaces';
import {renderTemplate} from '../nunjucks';
import {NgDocEntity} from './abstractions/entity';
import {NgDocNavigationEntity} from './abstractions/navigation.entity';
import {NgDocApiPageEntity} from './api-page.entity';
import {NgDocApiScopeEntity} from './api-scope.entity';
import {CachedEntity} from './cache/decorators';
import {NgDocCategoryEntity} from './category.entity';

@CachedEntity()
export class NgDocApiEntity extends NgDocNavigationEntity<NgDocApi> {
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
		return path.join(this.context.apiPath, this.route);
	}

	override get keywords(): string[] {
		return [];
	}

	override childrenGenerator(): Observable<NgDocEntity[]> {
		this.children.forEach((child: NgDocEntity) => child.destroy());

		return this.refreshImpl().pipe(
			switchMap(() => buildFileEntity(this.sourceFile, this.context.tsConfig, this.context.context.workspaceRoot)),
			switchMap(() => this.loadImpl()),
			map(() => generateApiEntities(this)),
		);
	}

	override loadImpl(): Observable<void> {
		return super.loadImpl().pipe(
			tap({
				next: () => {
					if (!this.title) {
						throw new Error(
							`Failed to load ${this.sourceFile.getFilePath()}. Make sure that you have a title property.`,
						);
					}

					this.parent = this.getParentFromCategory();
				},
				error: (e: Error) => this.errors.push(e),
			}),
		);
	}

	protected override buildImpl(): Observable<NgDocBuiltOutput[]> {
		return this.isReadyForBuild ? forkJoin([this.buildModule(), this.buildApiList()]) : of([]);
	}

	private buildModule(): Observable<NgDocBuiltOutput> {
		if (this.target) {
			const content: string = renderTemplate('./api.module.ts.nunj', {
				context: {
					api: this,
				},
			});

			return of({content, filePath: this.modulePath});
		}
		return of();
	}

	private buildApiList(): Observable<NgDocBuiltOutput> {
		const apiItems: NgDocApiList[] = this.children
			.filter(isApiScopeEntity)
			.sort((a: NgDocApiScopeEntity, b: NgDocApiScopeEntity) => (b.order ?? 0) - (a.order ?? 0))
			.map((scope: NgDocApiScopeEntity) => ({
				title: scope.title,
				items: scope.children.filter(isApiPageEntity).map((page: NgDocApiPageEntity) => ({
					route: slash(path.join(scope.route, page.route)),
					type: (page.declaration && getKindType(page.declaration)) ?? '',
					name: page.declaration?.getName() ?? '',
				})),
			}));

		return of({
			content: JSON.stringify(apiItems, undefined, 2),
			filePath: path.join(this.folderPath, 'ng-doc.api-list.json'),
		});
	}
}
