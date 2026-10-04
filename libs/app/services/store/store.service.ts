import { inject, Service } from '@angular/core';
import { WA_LOCAL_STORAGE } from '@ng-web-apis/common';

const DEFAULT_SERIALIZE: (v: unknown) => string = (v: unknown) => String(v);

/**
 * Reads and writes NgDoc settings (for example the theme) in the browser's local storage.
 */
@Service()
export class NgDocStoreService {
  protected readonly localStorage: Storage = inject(WA_LOCAL_STORAGE);

  /**
   * Stores a string value.
   * @param key - Storage key.
   * @param data - The value to store.
   */
  set(key: string, data: string): void;
  /**
   * Stores a value after serializing it.
   * @param key - Storage key.
   * @param data - The value to store.
   * @param serialize - Converts the value to a string.
   */
  set<T>(key: string, data: T, serialize: (v: T) => string): void;
  set<T>(key: string, data: T, serialize: (v: T) => string = DEFAULT_SERIALIZE): void {
    return this.localStorage.setItem(key, serialize(data));
  }

  /**
   * Returns the stored string, or `null` when the key is not set.
   * @param key - Storage key.
   */
  get(key: string): string | null;
  /**
   * Returns the stored value, deserialized.
   * @param key - Storage key.
   * @param deserialize - Converts the stored string (or `null`) to the value.
   */
  get<T>(key: string, deserialize: (v: string | null) => T): T;
  get<T>(key: string, deserialize?: (v: string | null) => T): T | string | null {
    return deserialize
      ? deserialize(this.localStorage.getItem(key))
      : this.localStorage.getItem(key);
  }
}
