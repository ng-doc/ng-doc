import { NgDocBaseInput } from '@ng-doc/ui-kit/classes/base-input';

export abstract class NgDocInputHost<T> {
	abstract inputControl?: NgDocBaseInput<T>;
}
