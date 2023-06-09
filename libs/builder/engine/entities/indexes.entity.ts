import {NgDocPageIndex} from '@ng-doc/core';
import path from 'path';
import {forkJoin, Observable, of} from 'rxjs';
import {map} from 'rxjs/operators';

import {NgDocBuildOutput} from '../../interfaces';
import {NgDocEntity} from './abstractions/entity';

export class NgDocIndexesEntity extends NgDocEntity {
	readonly id: string = 'NgDocIndexesEntity';
	readonly isRoot: boolean = true;
	readonly rootFiles: string[] = [];
	readonly parent: undefined = undefined;
	readonly buildCandidates: NgDocEntity[] = [];

	protected buildImpl(): Observable<NgDocBuildOutput[]> {
		return forkJoin([this.buildIndexes(), this.buildExportedKeywords()]);
	}

	private buildIndexes(): Observable<NgDocBuildOutput> {
		const allIndexes: NgDocPageIndex[] = this.store
			.asArray()
			.map((entity: NgDocEntity) => entity.indexes)
			.flat();

		return of(allIndexes).pipe(
			map((pageIndexes: NgDocPageIndex[]) => ({
				content: JSON.stringify(pageIndexes, null, 2),
				filePath: path.join(this.context.assetsPath, 'indexes.json'),
			})),
		);
	}

	private buildExportedKeywords(): Observable<NgDocBuildOutput> {
		const content: string = JSON.stringify(this.store.getKeywords());

		return of({content, filePath: path.join(this.context.assetsPath, 'keywords.json')});
	}
}
