import { NgDocPageIndex } from '@ng-doc/core';
import path from 'path';
import { Observable, of } from 'rxjs';

import { NgDocBuildResult } from '../../interfaces';
import { NgDocEntity } from './abstractions/entity';

export class NgDocIndexesEntity extends NgDocEntity {
	readonly id: string = 'NgDocIndexesEntity';
	readonly isRoot: boolean = true;
	readonly rootFiles: string[] = [];
	readonly parent: undefined = undefined;
	readonly buildCandidates: NgDocEntity[] = [];

	build(): Observable<NgDocBuildResult<NgDocPageIndex[]>> {
		const result: NgDocPageIndex[] = this.store
			.asArray()
			.map((entity: NgDocEntity) => entity.indexes)
			.flat();

		return of({
			result,
			entity: this,
			toBuilderOutput: async (content: NgDocPageIndex[]) => ({
				content: JSON.stringify(content, null, 2),
				filePath: path.join(this.context.assetsPath, 'indexes.json'),
			}),
		});
	}
}
