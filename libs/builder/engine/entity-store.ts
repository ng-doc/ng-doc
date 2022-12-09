import {asArray, objectKeys} from '@ng-doc/core';

import {isApiPageEntity, isRouteEntity} from '../helpers';
import {NgDocGlobalKeyword, NgDocKeyword} from '../interfaces';
import {NgDocEntity} from './entities/abstractions/entity';

export class NgDocEntityStore extends Map<string, NgDocEntity> {
	private keywordMap: Map<string, NgDocKeyword[]> = new Map<string, NgDocKeyword[]>();

	asArray(): NgDocEntity[] {
		return asArray(this.values());
	}

	override set(key: string, value: NgDocEntity): this {
		if (this.get(key) !== value) {
			this.get(key)?.destroy();
		}

		return super.set(key, value);
	}

	override delete(key: string): boolean {
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
			if (isRouteEntity(entity) && !entity.destroyed) {
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
