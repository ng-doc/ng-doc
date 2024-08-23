import { NgDocCachedClass } from './cache';

/**
 *
 * @param cls
 * @param propName
 */
export function cachedFilesInitializer(cls: unknown, propName: string): void {
  const castedThis: NgDocCachedClass = cls as unknown as NgDocCachedClass;

  if (!castedThis.__cachedFiles) {
    Object.defineProperty(castedThis, '__cachedFiles', {
      value: new Set(),
    });
  }

  castedThis.__cachedFiles?.add(propName);
}
