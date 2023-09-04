import { NgDocApiList } from '@ng-doc/core';
import * as path from 'path';
import { Observable, of } from 'rxjs';

import { getKindType, isApiPageEntity, isApiScopeEntity, slash } from '../../helpers';
import { NgDocBuilderContext, NgDocBuildResult } from '../../interfaces';
import { NgDocEntityStore } from '../entity-store';
import { NgDocEntity } from './abstractions/entity';
import { NgDocApiEntity } from './api.entity';
import { NgDocApiPageEntity } from './api-page.entity';
import { NgDocApiScopeEntity } from './api-scope.entity';
import { CachedEntity, CachedFilesGetter, NgDocCache } from './cache';

@CachedEntity()
export class NgDocApiListEntity extends NgDocEntity {
	override id: string = `NgDocIndexFile`;
	override isRoot: boolean = false;
	override rootFiles: string[] = [];
	override buildCandidates: NgDocEntity[] = [];

	constructor(
		override readonly store: NgDocEntityStore,
		override readonly cache: NgDocCache,
		override readonly context: NgDocBuilderContext,
		readonly parent: NgDocApiEntity,
	) {
		super(store, cache, context);
	}

	@CachedFilesGetter()
	get outputPath(): string {
		return path.join(this.parent.folderPath, 'ng-doc.api-list.json');
	}

	build(): Observable<NgDocBuildResult<NgDocApiList[]>> {
		const result: NgDocApiList[] = this.parent.children
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
			result,
			entity: this,
			toBuilderOutput: async (content: NgDocApiList[]) => ({
				content: JSON.stringify(content, undefined, 2),
				filePath: this.outputPath,
			}),
		});
	}
}
