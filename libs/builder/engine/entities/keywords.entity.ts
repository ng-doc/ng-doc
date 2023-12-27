import { NgDocKeyword } from '@ng-doc/core';
import path from 'path';
import { Observable, of } from 'rxjs';

import { NgDocBuildResult } from '../../interfaces';
import { NgDocEntity } from './abstractions/entity';

export class NgDocKeywordsEntity extends NgDocEntity {
	readonly id: string = 'NgDocKeywordsEntity';
	readonly isRoot: boolean = true;
	readonly rootFiles: string[] = [];
	readonly parent: undefined = undefined;
	readonly buildCandidates: NgDocEntity[] = [];

	build(): Observable<NgDocBuildResult<Record<string, NgDocKeyword>>> {
		const result = this.store.getKeywords();

		return of({
			result,
			entity: this,
			toBuilderOutput: async (content: Record<string, NgDocKeyword>) => ({
				content: JSON.stringify(content),
				filePath: path.join(this.context.outAssetsDir, 'keywords.json'),
			}),
		});
	}
}
