import {NgDocPageIndex} from '@ng-doc/core';
import path from 'path';
import {Observable, of} from 'rxjs';
import {map} from 'rxjs/operators';

import {NgDocBuiltOutput} from '../../interfaces';
import {NgDocEntity} from './abstractions/entity';

export class NgDocIndexesEntity extends NgDocEntity {
	readonly id: string = 'NgDocIndexesEntity';
	readonly isRoot: boolean = true;
	readonly rootFiles: string[] = [];
	readonly parent: undefined = undefined;
	readonly buildCandidates: NgDocEntity[] = [];

	protected override refreshImpl(): Observable<void> {
		return of(void 0);
	}

	protected override loadImpl(): Observable<void> {
		return of(void 0);
	}

	protected buildImpl(): Observable<NgDocBuiltOutput[]> {
		return this.buildIndexes();
	}

	private buildIndexes(): Observable<NgDocBuiltOutput[]> {
		const allIndexes: NgDocPageIndex[] = this.store
			.asArray()
			.map((entity: NgDocEntity) => entity.indexes)
			.flat();

		return of(allIndexes).pipe(
			map((pageIndexes: NgDocPageIndex[]) => [
				{
					content: JSON.stringify(pageIndexes, null, 2),
					filePath: path.join(this.context.assetsPath, 'indexes.json'),
				},
			]),
		);
	}
}
