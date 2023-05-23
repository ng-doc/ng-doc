import {NgDocBuilderContext} from '@ng-doc/builder';
import {asArray} from '@ng-doc/core';

import {createCache, isCacheValid, NgDocCache, NgDocCacheAccessor, NgDocCachedType, updateCache} from '../cache';

export abstract class NgDocCachedEntity {
	/**
	 * The key by which the entity will be stored in the store
	 */
	abstract readonly id: string;

	/**
	 * List of files that should be cached for the current entity.
	 */
	abstract cachedFilePaths: string[];

	cache?: NgDocCache;

	/**
	 * List of properties that should be cached for the current entity.
	 */
	cachedProperties: Map<string, NgDocCacheAccessor<any, any>> = new Map<string, NgDocCacheAccessor<any, any>>();

	protected constructor(readonly context: NgDocBuilderContext) {}

	/**
	 * Indicates when cache is valid for the current entity.
	 */
	isCacheValid(): boolean {
		return (
			!!this.cachedFilePaths.length && isCacheValid(this.id, this.createCache()) && this.context.config.cache !== false
		);
	}

	updateCache(): void {
		updateCache(this.id, this.createCache());
	}

	getCachedProperties(): Record<string, unknown> {
		const cachedProperties: Record<string, unknown> = {};

		asArray(this.cachedProperties.keys()).forEach((property: string) => {
			const accessor: NgDocCacheAccessor<NgDocCachedType> | undefined = this.cachedProperties.get(property);

			if (accessor) {
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				// @ts-ignore
				cachedProperties[property] = accessor.set(this[property]);
			}
		});

		return cachedProperties;
	}

	createCache(): NgDocCache {
		return createCache(undefined, this.cachedFilePaths, this.getCachedProperties());
	}
}
