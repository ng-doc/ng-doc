import {asArray, isPresent, NgDocCategory} from '@ng-doc/core';
import * as path from 'path';
import {Observable, of} from 'rxjs';
import {tap} from 'rxjs/operators';

import {isCategoryEntity, isPageEntity} from '../../helpers';
import {NgDocBuildResult, NgDocEntityKeyword} from '../../interfaces';
import {renderTemplate} from '../nunjucks';
import {NgDocEntity} from './abstractions/entity';
import {NgDocNavigationEntity} from './abstractions/navigation.entity';
import {CachedEntity} from './cache/decorators';
import {NgDocPageEntity} from './page.entity';

@CachedEntity()
export class NgDocCategoryEntity extends NgDocNavigationEntity<NgDocCategory> {
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

	override get canBeBuilt(): boolean {
		return isPresent(this.target)
			? !this.target.onlyForTags ||
					asArray(this.target.onlyForTags).includes(
						this.context.context.target?.configuration ?? '',
					)
			: true;
	}

	override get isRoot(): boolean {
		return !this.target?.category;
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

	override get keywords(): NgDocEntityKeyword[] {
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
		return this.target?.expanded ?? false;
	}

	override setParentDynamically(): void {
		super.setParentDynamically();

		this.parent = this.getParentFromCategory();
	}

	protected override loadImpl(): Observable<void> {
		return super.loadImpl().pipe(
			tap(() => {
				if (!this.title) {
					throw new Error(`Failed to load category. Make sure that you have a "title" property.`);
				}
			}),
		);
	}

	override build(): Observable<NgDocBuildResult<string>> {
		const result: string = renderTemplate('./category.ts.nunj', {
			context: {
				category: this,
			},
		});

		return of({
			result,
			entity: this,
			toBuilderOutput: async (content: string) => ({content, filePath: this.modulePath}),
		});
	}
}
