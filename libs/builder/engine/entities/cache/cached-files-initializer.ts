import {NgDocCachedClass} from './cache';
import {NgDocCachedType} from './interfaces';

/**
 *
 * @param cls
 * @param propName
 */
export function cachedFilesInitializer<TProperty, TCachedType extends NgDocCachedType>(
	cls: unknown,
	propName: string,
): void {
	const castedThis: NgDocCachedClass = cls as unknown as NgDocCachedClass;

	if (!castedThis.__cachedFiles) {
		Object.defineProperty(castedThis, '__cachedFiles', {
			value: new Set(),
		});
	}

	castedThis.__cachedFiles?.add(propName);
}
