import {asArray} from '@ng-doc/core';
import * as path from 'path';
import {forkJoin, Observable, of} from 'rxjs';
import {catchError, map, tap} from 'rxjs/operators';

import {isCategoryEntity, isPageEntity, uniqueName} from '../../helpers';
import {NgDocBuiltOutput, NgDocCategory} from '../../interfaces';
import {NgDocCategoryModuleEnv} from '../../templates-env';
import {NgDocRenderer} from '../renderer';
import {CACHE_PATH} from '../variables';
import {NgDocEntity} from './abstractions/entity';
import {NgDocNavigationEntity} from './abstractions/navigation.entity';
import {NgDocPageEntity} from './page.entity';

export class NgDocCategoryEntity extends NgDocNavigationEntity<NgDocCategory> {
	override moduleName: string = uniqueName(`NgDocGeneratedCategoryModule`);
	override moduleFileName: string = `${uniqueName('ng-doc-category')}.module.ts`;
	override parent?: NgDocCategoryEntity;

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

	get scope(): string {
		return this.target?.scope?.replace(CACHE_PATH, '') ?? this.parent?.scope ?? this.context.context.workspaceRoot;
	}

	override get order(): number | undefined {
		return this.target?.order;
	}

	get pages(): NgDocPageEntity[] {
		return asArray(this.children.values()).filter(isPageEntity);
	}

	get categories(): NgDocCategoryEntity[] {
		return asArray(this.children.values()).filter(isCategoryEntity);
	}

	override get keywords(): string[] {
		return [];
	}

	override get title(): string {
		return this.target?.title ?? '';
	}

	override get buildCandidates(): NgDocEntity[] {
		return this.childEntities;
	}

	get expandable(): boolean {
		return this.target?.expandable ?? true;
	}

	get expanded(): boolean {
		return this.target?.expanded ?? !this.isRoot;
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
		return this.isReadyToBuild ? forkJoin([this.buildModule()]) : of([]);
	}

	private buildModule(): Observable<NgDocBuiltOutput> {
		if (this.target) {
			const renderer: NgDocRenderer<NgDocCategoryModuleEnv> = new NgDocRenderer<NgDocCategoryModuleEnv>({
				category: this,
			});

			return renderer
				.render('category.module.ts.nunj')
				.pipe(map((output: string) => ({output, filePath: this.modulePath})));
		}
		return of();
	}
}
