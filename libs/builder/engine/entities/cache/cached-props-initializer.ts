import {NgDocCachedClass} from './cache';
import {NgDocCacheAccessor, NgDocCachedType} from './interfaces';

/**
 *
 * @param cls
 * @param propName
 * @param accessor
 */
export function cachedPropsInitializer<TProperty, TCachedType extends NgDocCachedType>(
	cls: unknown,
	propName: string,
	accessor?: Partial<NgDocCacheAccessor<TCachedType, TProperty>>,
): void {
	const castedThis: NgDocCachedClass = cls as unknown as NgDocCachedClass;

	if (!castedThis.__cachedProps) {
		Object.defineProperty(castedThis, '__cachedProps', {
			value: new Map(),
		});
	}

	castedThis.__cachedProps?.set(propName, {
		get: accessor?.get ?? ((value: TCachedType) => value),
		set: accessor?.set ?? ((value: TProperty) => value),
	});
}
