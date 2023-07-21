import {renderTemplate} from '@ng-doc/builder';
import * as path from 'path';
import {Observable, of} from 'rxjs';

import {NgDocBuilderContext, NgDocBuildResult} from '../../interfaces';
import {NgDocEntityStore} from '../entity-store';
import {NgDocEntity} from './abstractions/entity';
import {NgDocCache} from './cache';
import {NgDocSkeletonEntity} from './skeleton.entity';

export class NgDocRoutesEntity extends NgDocEntity {
	override id: string = `${this.parent.id}#routes`;
	override isRoot: boolean = false;

	constructor(
		override readonly store: NgDocEntityStore,
		override readonly cache: NgDocCache,
		override readonly context: NgDocBuilderContext,
		readonly parent: NgDocSkeletonEntity,
	) {
		super(store, cache, context);
	}

	override get rootFiles(): string[] {
		return [];
	}

	override get buildCandidates(): NgDocEntity[] {
		return [this.parent];
	}

	build(): Observable<NgDocBuildResult<string>> {
		const entities: NgDocEntity[] = this.parent.rootEntitiesForBuild;
		const result: string = renderTemplate('./routing.ts.nunj', {context: {entities}});

		return of({
			result,
			entity: this,
			toBuilderOutput: async (content: string) => ({
				content,
				filePath: path.join(this.context.buildPath, 'ng-doc.routing.ts'),
			}),
		});
	}
}
