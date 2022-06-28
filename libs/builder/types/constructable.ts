export interface Constructable<T = unknown> {
	new (...args: any[]): T;
}
