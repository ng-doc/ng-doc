import {asArray, Constructor} from '@ng-doc/core';

import {NgDocCachedEntity} from '../../abstractions/cached.entity';
import {NgDocCacheAccessor, NgDocCachedType} from '../interfaces';
import {loadCache} from '../load-cache';

/**
 * Decorator for cached entities, it will load the cache and assign the properties to the entity
 */
export function CachedEntity<TClass extends Constructor<NgDocCachedEntity & {id: string}>>() {
	return (Value: TClass, _context: ClassDecoratorContext<TClass>) => {
		abstract class NgDocCacheEntityWrapper extends Value {
			protected constructor(...args: any[]) {
				super(...args);

				this.cache = loadCache(this.id);

				asArray(this.cachedProperties.keys()).forEach((property: string) => {
					const accessor: NgDocCacheAccessor<NgDocCachedType> | undefined = this.cachedProperties.get(property);
					const value: unknown = this.cache?.properties?.[property];

					if (Object.keys(this.cache?.properties ?? {}).includes(property) && accessor) {
						Object.assign(this, {[property]: accessor.get(value as NgDocCachedType)});
					}
				});
			}
		}

		return NgDocCacheEntityWrapper;
	};
}
