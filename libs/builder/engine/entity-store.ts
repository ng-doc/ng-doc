import {asArray} from '@ng-doc/core';
import {Observable, Subject} from 'rxjs';

import {isRouteEntity} from '../helpers';
import {NgDocEntity} from './entities/abstractions/entity';
import {NgDocRouteEntity} from './entities/abstractions/route.entity';

export class NgDocEntityStore extends Map<string, NgDocEntity> {
	private changed$: Subject<[NgDocEntity, boolean]> = new Subject<[NgDocEntity, boolean]>();
	private keywordMap: Map<string, NgDocRouteEntity[]> = new Map<string, NgDocRouteEntity[]>();

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

	getByKeyword(keyword: string): NgDocRouteEntity | undefined {
		return asArray(this.keywordMap.get(keyword))[0];
	}

	getAllByKeyword(keyword: string): NgDocRouteEntity[] {
		return asArray(this.keywordMap.get(keyword));
	}

	updateKeywordMap(): void {
		this.keywordMap = new Map<string, NgDocRouteEntity[]>();

		this.asArray().forEach((entity: NgDocEntity) => {
			if (isRouteEntity(entity)) {
				entity.keywords.forEach((keyword: string) =>
					this.keywordMap.set(keyword, [...asArray(this.keywordMap.get(keyword)), entity]),
				);
			}
		});
	}
}
