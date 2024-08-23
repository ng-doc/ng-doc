import { asArray, Constructor } from '@ng-doc/core';

import { NgDocCachedClass } from '../cache';
import { loadCache } from '../helpers';
import { NgDocCacheAccessor, NgDocCachedData, NgDocCachedType } from '../interfaces';

/**
 * Decorator for cached entities, it will load the cache and assign the properties to the entity
 */
export function CachedEntity<TClass extends Constructor<{ id: string }>>() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (Value: TClass, _context: ClassDecoratorContext<TClass>) => {
    return class extends Value implements NgDocCachedClass {
      __cachedProps?: Map<string, NgDocCacheAccessor<any, any>>;
      __cachedFiles?: Set<string>;

      protected constructor(...args: any[]) {
        super(...args);

        const cache: NgDocCachedData = loadCache(this.id);

        asArray(this.__cachedProps?.keys()).forEach((property: string) => {
          const accessor: NgDocCacheAccessor<NgDocCachedType> | undefined =
            this.__cachedProps?.get(property);
          // @ts-expect-error - We are using the property as a key
          const value: unknown = cache.data?.[property];

          if (Object.keys(cache?.data ?? {}).includes(property) && accessor) {
            Object.assign(this, { [property]: accessor.get(value as NgDocCachedType) });
          }
        });
      }
    };
  };
}
