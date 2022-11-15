import {asArray} from '@ng-doc/core';
import {Observable, Subject} from 'rxjs';

import {NgDocEntity} from './entities/abstractions/entity';

export class NgDocEntityStore extends Map<string, NgDocEntity> {
	private changed$: Subject<[NgDocEntity, boolean]> = new Subject<[NgDocEntity, boolean]>();

	changes(): Observable<[NgDocEntity, boolean]> {
		return this.changed$.asObservable();
	}

	asArray(): NgDocEntity[] {
		return asArray(this.values());
	}

	override set(key: string, value: NgDocEntity): this {
		if (this.has(key)) {
			throw new Error(`Entity with id "${key}" already exists.`);
		}
		this.changed$.next([value, false]);

		return super.set(key, value);
	}

	override delete(key: string): boolean {
		const entity: NgDocEntity | undefined = this.get(key);

		entity && this.changed$.next([entity, true]);

		return super.delete(key);
	}
}
