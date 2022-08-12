import {TestType} from './test';

export class TestClass {
	/** My property */
	property1: TestType = 'asd';
	private property2: string = 'aks98d';

	/**
	 * Function description
	 *
	 * @param parameter
	 * @param parameter2
	 */
	method1(parameter: number, parameter2: string): void {
		console.log(parameter, parameter2);
	}

	private method2(): void {
		console.log('method');
	}
}

export enum MyEnum1 {
	KEY1,
	KEY2,
}

export interface MyInterface {
	property1: string;
	property2: number;
	nested: {
		property1: string;
		property2: number;
	};
}

export type MyType = string | number;

/**
 *
 * @param parameter
 */
export function myFunction(parameter: MyType): void {
	console.log(parameter);
}
