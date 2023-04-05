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

	override update(): Observable<void> {
		return of(void 0);
	}

	protected build(): Observable<NgDocBuiltOutput[]> {
		return this.buildIndexes();
	}

	override get cachedPaths(): string[] {
		return [this.pathToIndexFile];
	}

	get pathToIndexFile(): string {
		return path.join(this.context.assetsPath, 'indexes.json')
	}

	private buildIndexes(): Observable<NgDocBuiltOutput[]> {
		const allIndices: NgDocPageIndex[] = this.builder.entities
			.asArray()
			.map((entity: NgDocEntity) => entity.indexes)
			.flat();

		return of(allIndices).pipe(
			map((pageIndices: NgDocPageIndex[]) => [
				{
					content: JSON.stringify(pageIndices, null, 2),
					filePath: this.pathToIndexFile,
				},
			]),
		);
	}
}
