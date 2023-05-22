export type Constructor<T = unknown> = new (...args: any[]) => T;
// eslint-disable-next-line @typescript-eslint/ban-types
export type AbstractConstructor<T = unknown> = abstract new (...args: any[]) => T;
