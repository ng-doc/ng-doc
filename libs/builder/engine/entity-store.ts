import {asArray, objectKeys} from '@ng-doc/core';
import {Observable, Subject} from 'rxjs';

import {isApiPageEntity, isRouteEntity} from '../helpers';
import {NgDocEntity} from './entities/abstractions/entity';
import {NgDocGlobalKeyword, NgDocKeyword} from '../interfaces';

export class NgDocEntityStore extends Map<string, NgDocEntity> {
	private changed$: Subject<[NgDocEntity, boolean]> = new Subject<[NgDocEntity, boolean]>();
	private keywordMap: Map<string, NgDocKeyword[]> = new Map<string, NgDocKeyword[]>();

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

	getByKeyword(keyword: string): NgDocKeyword | undefined {
		return asArray(this.keywordMap.get(keyword))[0];
	}

	getAllByKeyword(keyword: string): NgDocKeyword[] {
		return asArray(this.keywordMap.get(keyword));
	}

	updateKeywordMap(globalKeywords?: Record<string, NgDocGlobalKeyword>): void {
		this.keywordMap = new Map<string, NgDocKeyword[]>();

		objectKeys(globalKeywords ?? {}).forEach((key: string) => {
			if (globalKeywords) {
				const globalKeyword: NgDocGlobalKeyword | undefined = globalKeywords[key];

				if (globalKeyword) {
					this.addKeyword(key, {
						title: globalKeyword.title ?? key,
						path: globalKeyword.path,
						isCodeLink: !!globalKeyword.isCodeLink
					});
				}
			}
		});

		this.asArray().forEach((entity: NgDocEntity) => {
			if (isRouteEntity(entity)) {
				entity.keywords.forEach((keyword: string) =>
					this.addKeyword(keyword, {
						title: entity.title,
						path: entity.fullRoute,
						isCodeLink: isApiPageEntity(entity),
					}),
				);
			}
		});
	}

	private addKeyword(key: string, keyword: NgDocKeyword): void {
		this.keywordMap.set(key, [...asArray(this.keywordMap.get(key)), keyword]);
	}
}
