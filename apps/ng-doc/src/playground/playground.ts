import {HostBinding, Input} from '@angular/core';

export abstract class ParentClass {
	abstract parentAbstractMethod1(): void;
	abstract parentAbstractMethod2(): void;

	@Input()
	@HostBinding()
	parentMethod1(): void {
		console.log('');
	}

	/**
	 * Comment
	 */
	parentMethod2(): void {
		console.log('');
	}

	@Input()
	@HostBinding()
	/**
	 * Comment getter
	 */
	get prop(): string {
		return '';
	}

	/**
	 * Comment setter
	 */
	set prop(v: string) {
		console.log('');
	}
}

export class Class extends ParentClass implements Int {
	@Input()
	@HostBinding()
	intGetterProp: string = '';
	intSetterProp: string = '';
	parentAbstractMethod1: () => void = () => {
		console.log('');
	};

	parentAbstractMethod2(): void {
		console.log('');
	}

	@Input()
	@HostBinding()
	override set prop(v: string) {
		console.log('');
	}

	override parentMethod2(): void {
		console.log('');
	}
}

export interface Int {
	get intGetterProp(): string;

	set intSetterProp(v: string);
}
