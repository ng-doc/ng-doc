import {NgDocConfiguration, NgDocEntityKeyword} from '@ng-doc/builder';
import {asArray, NgDocGlobalKeyword, NgDocKeyword, NgDocKeywordsLoader, objectKeys} from '@ng-doc/core';

import {getKeywordTypeFromEntity, isApiPageEntity, isRouteEntity, keywordKey} from '../helpers';
import {NgDocEntity} from './entities/abstractions/entity';

export class NgDocEntityStore extends Map<string, NgDocEntity> {
	private keywordMap: Map<string, NgDocKeyword> = new Map<string, NgDocKeyword>();
	private globalKeywords: Map<string, NgDocKeyword> = new Map<string, NgDocKeyword>();

	constructor(private readonly config: NgDocConfiguration) {
		super();
	}

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
		const key: string = keywordKey(keyword);

		return this.keywordMap.get(key) ?? this.globalKeywords.get(key);
	}

	getKeywords(): Record<string, NgDocKeyword> {
		return Object.fromEntries(this.keywordMap);
	}

	async loadGlobalKeywords(): Promise<void> {
		const keywordLoaders: NgDocKeywordsLoader[] = asArray(this.config?.keywords?.loaders);
		const keywords: Array<Record<string, NgDocGlobalKeyword>> = await Promise.all(
			keywordLoaders.map((loader: NgDocKeywordsLoader) => loader()),
		);

		keywords.concat(this.config?.keywords?.keywords ?? {}).forEach((keywords: Record<string, NgDocGlobalKeyword>) => {
			objectKeys(keywords).forEach((key: string) => {
				const keyword: NgDocGlobalKeyword | undefined = keywords[key];

				if (keyword) {
					this.globalKeywords.set(keywordKey(key), {
						title: keyword.title ?? key,
						path: keyword.url,
						description: keyword.description,
						isCodeLink: !!keyword.isCodeLink,
					});
				}
			});
		});
	}

	updateKeywordMap(): void {
		this.keywordMap.clear();

		this.asArray().forEach((entity: NgDocEntity) => {
			if (isRouteEntity(entity) && entity.isReadyForBuild) {
				entity.keywords.forEach((keyword: NgDocEntityKeyword) =>
					this.addKeyword(keywordKey(keyword.key), {
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
		this.keywordMap.set(key, keyword);
	}
}
