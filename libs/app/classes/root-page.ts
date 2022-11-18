import {Type} from '@angular/core';
import {NgDocDemoAssets} from '@ng-doc/app/interfaces';
import {NgDocPlayground} from '@ng-doc/builder';

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

export abstract class MyClass2 extends MyClass1 implements MyInterface1, MyInterface2 {

}

