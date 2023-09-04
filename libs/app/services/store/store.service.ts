import { Injectable } from '@angular/core';

const DEFAULT_SERIALIZE: (v: unknown) => string = (v: unknown) => String(v);

@Injectable({
	providedIn: 'root',
})
export class NgDocStoreService {
	set(key: string, data: string): void;
	set<T>(key: string, data: T, serialize: (v: T) => string): void;
	set<T>(key: string, data: T, serialize: (v: T) => string = DEFAULT_SERIALIZE): void {
		return localStorage.setItem(key, serialize(data));
	}

	get(key: string): string | null;
	get<T>(key: string, deserialize: (v: string | null) => T): T;
	get<T>(key: string, deserialize?: (v: string | null) => T): T | string | null {
		return deserialize ? deserialize(localStorage.getItem(key)) : localStorage.getItem(key);
	}
}
