import {NgDocApi} from '@ng-doc/core';
import * as path from 'path';
import {EMPTY, Observable, of} from 'rxjs';
import {map, switchMap, tap} from 'rxjs/operators';

import {buildFileEntity, generateApiEntities, uniqueName} from '../../helpers';
import {NgDocBuildResult, NgDocEntityKeyword} from '../../interfaces';
import {renderTemplate} from '../nunjucks';
import {NgDocEntity} from './abstractions/entity';
import {NgDocNavigationEntity} from './abstractions/navigation.entity';
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

	override get keywords(): NgDocEntityKeyword[] {
		return [];
	}

	override setParentDynamically(): void {
		super.setParentDynamically();

		this.parent = this.getParentFromCategory();
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
				},
				error: (e: Error) => this.errors.push(e),
			}),
		);
	}

	override build(): Observable<NgDocBuildResult<string>> {
		if (this.target) {
			const result = renderTemplate('./api.module.ts.nunj', {
				context: {
					api: this,
				},
			});

			return of({
				result,
				entity: this,
				toBuilderOutput: async (content: string) => ({
					content,
					filePath: this.modulePath,
				}),
			});
		}

		return EMPTY;
	}

	// private buildApiList(): Observable<NgDocBuilderOutput> {
	// 	const apiItems: NgDocApiList[] = this.children
	// 		.filter(isApiScopeEntity)
	// 		.sort((a: NgDocApiScopeEntity, b: NgDocApiScopeEntity) => (b.order ?? 0) - (a.order ?? 0))
	// 		.map((scope: NgDocApiScopeEntity) => ({
	// 			title: scope.title,
	// 			items: scope.children.filter(isApiPageEntity).map((page: NgDocApiPageEntity) => ({
	// 				route: slash(path.join(scope.route, page.route)),
	// 				type: (page.declaration && getKindType(page.declaration)) ?? '',
	// 				name: page.declaration?.getName() ?? '',
	// 			})),
	// 		}));
	//
	// 	return of({
	// 		content: JSON.stringify(apiItems, undefined, 2),
	// 		filePath: path.join(this.folderPath, 'ng-doc.api-list.json'),
	// 	});
	// }
}
