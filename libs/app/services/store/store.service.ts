import { inject, Injectable } from '@angular/core';
import { WA_LOCAL_STORAGE } from '@ng-web-apis/common';

const DEFAULT_SERIALIZE: (v: unknown) => string = (v: unknown) => String(v);

@Injectable({
	providedIn: 'root',
})
export class NgDocStoreService {
	protected readonly localStorage: Storage = inject(WA_LOCAL_STORAGE);

	set(key: string, data: string): void;
	set<T>(key: string, data: T, serialize: (v: T) => string): void;
	set<T>(key: string, data: T, serialize: (v: T) => string = DEFAULT_SERIALIZE): void {
		return this.localStorage.setItem(key, serialize(data));
	}

	get(key: string): string | null;
	get<T>(key: string, deserialize: (v: string | null) => T): T;
	get<T>(key: string, deserialize?: (v: string | null) => T): T | string | null {
		return deserialize
			? deserialize(this.localStorage.getItem(key))
			: this.localStorage.getItem(key);
	}
}
