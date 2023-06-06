import {NgDocEntityKeyword} from '@ng-doc/builder';
import {asArray, NgDocGlobalKeyword, NgDocKeyword, objectKeys} from '@ng-doc/core';

import {getKeywordTypeFromEntity, isApiPageEntity, isRouteEntity} from '../helpers';
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
						isCodeLink: !!globalKeyword.isCodeLink,
					});
				}
			}
		});

		this.asArray().forEach((entity: NgDocEntity) => {
			if (isRouteEntity(entity) && entity.isReadyForBuild) {
				entity.keywords.forEach((keyword: NgDocEntityKeyword) =>
					this.addKeyword(keyword.key, {
						title: keyword.title,
						path: keyword.path,
						type: getKeywordTypeFromEntity(entity),
						isCodeLink: isApiPageEntity(entity),
					}),
				);
			}
		});
	}

	getAllWithErrorsOrWarnings(): NgDocEntity[] {
		return this.asArray().filter((entity: NgDocEntity) => entity.errors.length || entity.warnings.length);
	}

	private addKeyword(key: string, keyword: NgDocKeyword): void {
		this.keywordMap.set(key, [...asArray(this.keywordMap.get(key)), keyword]);
	}
}
