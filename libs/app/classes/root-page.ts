import {Type} from '@angular/core';
import {NgDocDemoAssets} from '@ng-doc/app/interfaces';
import {NgDocPlayground} from '@ng-doc/builder';
import {ClassDeclaration} from 'ng-morph';

export abstract class NgDocRootPage {
	abstract readonly pageContent: string;
	abstract readonly module?: Type<object>;
	abstract readonly demo?: Record<string, Type<object>>;
	abstract readonly demoAssets?: NgDocDemoAssets;
	abstract readonly playground?: NgDocPlayground;
}

export class MyClass1{

}

export interface MyInterface1 {
 val1?: string;
}

export interface MyInterface2 {
	val2?: string;
}

/**
 * Some really ling text that you can tead o assdkorwp poiqpwoie dpsfi aposdi pai dasdaos iapsod
 * asdpaoisa psd aii apso iaiidpqowie q psad paisdp as as aps
 * apsod iaps oi i apsoipqoiepqow poi `MyListComponent`
 */
export abstract class MyClass2 extends MyClass1 implements MyInterface1 {
	val1: string | undefined;
	/**
	 * Some really ling text that you can tead o assdkorwp poiqpwoie dpsfi aposdi pai dasdaos iapsod
	 * asdpaoisa psd aii apso iaiidpqowie q psad paisdp as as aps
	 * apsod iaps oi i apsoipqoiepqow poi
	 */
	static property2: string = 'default value';
	/**
	 * Some really ling text that you can tead o assdkorwp poiqpwoie dpsfi aposdi pai dasdaos iapsod
	 * asdpaoisa psd aii apso iaiidpqowie q psad paisdp as as aps
	 * apsod iaps oi i apsoipqoiepqow poi
	 */
	abstract property: string;
	/**
	 * Some really ling text that you can tead o assdkorwp poiqpwoie dpsfi aposdi pai dasdaos iapsod
	 * asdpaoisa psd aii apso iaiidpqowie q psad paisdp as as aps
	 * apsod iaps oi i apsoipqoiepqow poi
	 */
	property2: string = 'default value';

	/**
	 * Some really ling text that you can tead o assdkorwp poiqpwoie dpsfi aposdi pai dasdaos iapsod
	 * asdpaoisa psd aii apso iaiidpqowie q psad paisdp as as aps
	 * apsod iaps oi i apsoipqoiepqow poi
	 *
	 * @param value Some really ling text that you can tead o assdkorwp poiqpwoie dpsfi aposdi pai dasdaos iapsod
	 */
	static method2(value: string): string {
		return value;
	}

	/**
	 * Some really ling text that you can tead o assdkorwp poiqpwoie dpsfi aposdi pai dasdaos iapsod
	 * asdpaoisa psd aii apso iaiidpqowie q psad paisdp as as aps
	 * apsod iaps oi i apsoipqoiepqow poi
	 *
	 * @param value Some really ling text that you can tead o assdkorwp poiqpwoie dpsfi aposdi pai dasdaos iapsod
	 */
	method1(value: string): string {
		return value;
	}


	/**
	 * Some really ling text that you can tead o assdkorwp poiqpwoie dpsfi aposdi pai dasdaos iapsod
	 * asdpaoisa psd aii apso iaiidpqowie q psad paisdp as as aps
	 * apsod iaps oi i apsoipqoiepqow poi
	 *
	 * @param value Some really ling text that you can tead o assdkorwp poiqpwoie dpsfi aposdi pai dasdaos iapsod
	 */
	abstract method3(value: string): string;
}
