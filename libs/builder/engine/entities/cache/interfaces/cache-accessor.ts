
export type NgDocCachedType = string | number | boolean | object | Array<string | number | boolean | object>;

export interface NgDocCacheAccessor<TValue extends NgDocCachedType, T = unknown> {
	get: (value: TValue) => T;
	set: (value: T) => TValue;
}
