import {NgDocBuilderContext} from '@ng-doc/builder';
import {asArray} from '@ng-doc/core';

import {isCacheValid, NgDocCache, updateCache} from '../cache';

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
	cachedProperties: Set<string> = new Set<string>();

	protected constructor(readonly context: NgDocBuilderContext) {}

	/**
	 * Indicates when cache is valid for the current entity.
	 */
	isCacheValid(): boolean {
		return !!this.cachedFilePaths.length && isCacheValid(this.id, this) && this.context.config.cache !== false;
	}

	updateCache(): void {
		updateCache(this.id, this);
	}

	getCachedProperties(): Record<string, unknown> {
		const cachedProperties: Record<string, unknown> = {};

		asArray(this.cachedProperties).forEach((property: string) => {
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment
			// @ts-ignore
			cachedProperties[property] = this[property];
		});

		return cachedProperties;
	}
}
