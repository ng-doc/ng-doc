import {Constructor} from '@ng-doc/core';

import {NgDocCachedEntity} from '../../abstractions/cached.entity';
import {loadCache} from '../load-cache';

/**
 *
 */
export function CachedEntity<TClass extends Constructor<NgDocCachedEntity & {id: string}>>() {
	return (Value: TClass, _context: ClassDecoratorContext<TClass>) => {
		abstract class NgDocCacheEntityWrapper extends Value {
			protected constructor(...args: any[]) {
				super(...args);

				this.cache = loadCache(this.id);

				this.cachedProperties.forEach((property: string) => {
					if (Object.keys(this.cache?.properties ?? {}).includes(property)) {
						Object.assign(this, {[property]: this.cache?.properties?.[property]});
					}
				});
			}
		}

		return NgDocCacheEntityWrapper;
	};
}
