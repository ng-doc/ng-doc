export type Constructor<T = any> = new (...args: any[]) => T;
// eslint-disable-next-line @typescript-eslint/ban-types
export type AbstractConstructor<T = any> = abstract new (...args: any[]) => T;
