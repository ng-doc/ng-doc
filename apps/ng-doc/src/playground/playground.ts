export abstract class ParentClass {
	abstract parentAbstractMethod1(): void;
	abstract parentAbstractMethod2(): void;

	parentMethod1(): void {
		console.log('');
	}

	/**
	 * Comment
	 */
	parentMethod2(): void {
		console.log('');
	}

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
	intGetterProp: string = '';
	intSetterProp: string = '';
	parentAbstractMethod1: () => void = () => {
		console.log('');
	};

	parentAbstractMethod2(): void {
		console.log('');
	}

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
