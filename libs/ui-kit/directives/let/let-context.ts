import {NgDocContextWithImplicit} from '@ng-doc/ui-kit/interfaces';

import {NgDocLetDirective} from './let.directive';

export class NgDocLetContext<T> implements NgDocContextWithImplicit<T> {
	constructor(private readonly internalDirectiveInstance: NgDocLetDirective<T>) {}

	get $implicit(): T {
		return this.internalDirectiveInstance.ngDocLet;
	}

	get ngDocLet(): T {
		return this.internalDirectiveInstance.ngDocLet;
	}
}
