import {NEVER, Observable} from 'rxjs';

import {NgDocBuilderContext, NgDocBuildResult} from '../../interfaces';
import {NgDocEntityStore} from '../entity-store';
import {NgDocEntity} from './abstractions/entity';
import {NgDocCache} from './cache';
import {NgDocPageEntity} from './page.entity';

export class NgDocPagePlaygroundEntity extends NgDocEntity {
	override id: string = `${this.parent.id}#playground`;
	override isRoot: boolean = false;

	constructor(
		override readonly store: NgDocEntityStore,
		override readonly cache: NgDocCache,
		override readonly context: NgDocBuilderContext,
		readonly parent: NgDocPageEntity,
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
		return NEVER;
	}
}
