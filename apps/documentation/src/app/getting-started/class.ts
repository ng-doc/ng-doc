import {TestType} from './test';

export abstract class TestClass implements MyInterface {
	/**
	 * My property
	 *
	 * @type {TestType}
	 *
	 * asdasd
	 */
	static property1: TestType = 'asd';
	property2: string | number = 'aks98d';

	/**
	 * Function description
	 *
	 * @param parameter
	 * @param parameter2
	 */
	method1(parameter: number): number;
	method1(parameter: number, parameter2: string): string;
	method1(parameter: number, parameter2?: string): string | number {
		console.log(parameter, parameter2);
		return '';
	}

	private method2(): void {
		console.log('method');
	}
}

/** What about this */
export enum MyEnum1 {
	/** Key 1 description */
	KEY1,
	/** Key 2 description */
	KEY2,
}

export interface MyInterface {
	property1?: TestType;
	property2: string | number;
	method(prop1: number): void;
}

export type MyType = string | number;

/**
 *
 * @param parameter
 */
export function myFunction(parameter: MyType): void {
	console.log(parameter);
}
