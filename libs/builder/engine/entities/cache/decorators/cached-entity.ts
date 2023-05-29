import {NgDocBuilder} from '@ng-doc/builder';
import {asArray, Constructor} from '@ng-doc/core';

import {NgDocCachedClass} from '../cache';
import {loadCache} from '../helpers';
import {NgDocCacheAccessor, NgDocCachedData, NgDocCachedType} from '../interfaces';

/**
 * Decorator for cached entities, it will load the cache and assign the properties to the entity
 */
export function CachedEntity<TClass extends Constructor<{id: string}>>() {
	return (Value: TClass, _context: ClassDecoratorContext<TClass>) => {
		abstract class NgDocCacheEntityWrapper extends Value implements NgDocCachedClass {
			__cachedProps?: Map<string, NgDocCacheAccessor<any, any>>;
			__cachedFiles?: Set<string>;

			protected constructor(...args: any[]) {
				super(...args);

				const builder: NgDocBuilder | undefined = args.find((arg: unknown) => arg instanceof NgDocBuilder);

				if (builder) {
					const cache: NgDocCachedData = loadCache(this.id);

					asArray(this.__cachedProps?.keys()).forEach((property: string) => {
						const accessor: NgDocCacheAccessor<NgDocCachedType> | undefined = this.__cachedProps?.get(property);
						const value: unknown = cache.properties?.[property];

						if (Object.keys(cache?.properties ?? {}).includes(property) && accessor) {
							Object.assign(this, {[property]: accessor.get(value as NgDocCachedType)});
						}
					});
				}
			}
		}

		return NgDocCacheEntityWrapper;
	};
}
