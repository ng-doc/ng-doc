import {asArray, Constructor, isPresent} from '@ng-doc/core';

import {createCache, isCacheValid, updateCache} from './helpers';
import {NgDocCacheAccessor, NgDocCachedType} from './interfaces';

export interface NgDocCachedClass {
	__cachedProps?: Map<string, NgDocCacheAccessor<any, any>>;
	__cachedFiles?: Set<string>;
}

export class NgDocCache<T extends InstanceType<Constructor<{id: string}>> = InstanceType<Constructor<{id: string}>>> {
	isCacheValid(cls: T): boolean {
		return isCacheValid(cls.id, createCache(undefined, this.getCachedPaths(cls), this.getCachedProperties(cls)));
	}

	cache(cls: T): void {
		updateCache(cls.id, createCache(undefined, this.getCachedPaths(cls), this.getCachedProperties(cls)));
	}

	private getCachedPaths(cls: T): string[] {
		return asArray(
			new Set(
				asArray((cls as unknown as NgDocCachedClass).__cachedFiles?.values())
					// eslint-disable-next-line @typescript-eslint/ban-ts-comment
					// @ts-ignore
					.map((property: string) => cls[property] as string | string[])
					.filter(isPresent)
					.flat(),
			).values(),
		);
	}

	private getCachedProperties(cls: T): Record<string, unknown> {
		const cachedProperties: Record<string, unknown> = {};

		asArray((cls as unknown as NgDocCachedClass).__cachedProps?.keys()).forEach((property: string) => {
			const accessor: NgDocCacheAccessor<NgDocCachedType> | undefined = (
				cls as unknown as NgDocCachedClass
			).__cachedProps?.get(property);

			if (accessor) {
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				// @ts-ignore
				cachedProperties[property] = accessor.set(cls[property]);
			}
		});

		return cachedProperties;
	}
}
