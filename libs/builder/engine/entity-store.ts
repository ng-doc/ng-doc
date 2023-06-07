import {NgDocConfiguration, NgDocEntityKeyword, NgDocKeywordLoader} from '@ng-doc/builder';
import {asArray, NgDocGlobalKeyword, NgDocKeyword, objectKeys} from '@ng-doc/core';

import {getKeywordTypeFromEntity, isApiPageEntity, isRouteEntity} from '../helpers';
import {NgDocEntity} from './entities/abstractions/entity';

export class NgDocEntityStore extends Map<string, NgDocEntity> {
	private keywordMap: Map<string, NgDocKeyword[]> = new Map<string, NgDocKeyword[]>();
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
		return asArray(this.keywordMap.get(keyword)).concat(asArray(this.globalKeywords.get(keyword)))[0];
	}

	getAllByKeyword(keyword: string): NgDocKeyword[] {
		return asArray(this.keywordMap.get(keyword)).concat(asArray(this.globalKeywords.get(keyword)));
	}

	async loadGlobalKeywords(): Promise<void> {
		const keywordLoaders: NgDocKeywordLoader[] = asArray(this.config?.keywordLoaders);
		const keywords: Array<Record<string, NgDocGlobalKeyword>> = await Promise.all(
			keywordLoaders.map((loader: NgDocKeywordLoader) => loader()),
		);

		keywords.forEach((keywords: Record<string, NgDocGlobalKeyword>) => {
			objectKeys(keywords).forEach((key: string) => {
				const globalKeyword: NgDocGlobalKeyword | undefined = keywords[key];

				if (globalKeyword) {
					this.globalKeywords.set(key, this.globalKeywordToKeyword(globalKeyword));
				}
			});
		})

		objectKeys(this.config?.keywords ?? {}).forEach((key: string) => {
			if (this.config?.keywords) {
				const globalKeyword: NgDocGlobalKeyword | undefined = this.config?.keywords[key];

				if (globalKeyword) {
					this.globalKeywords.set(key, this.globalKeywordToKeyword(globalKeyword));
				}
			}
		});
	}

	updateKeywordMap(): void {
		this.keywordMap = new Map<string, NgDocKeyword[]>();

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

	private globalKeywordToKeyword(keyword: NgDocGlobalKeyword): NgDocKeyword {
		return {
			title: keyword.title ?? keyword.path,
			path: keyword.path,
			isCodeLink: !!keyword.isCodeLink,
		};
	}
}
