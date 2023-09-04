import { NgDocDisplayValueFunction } from '@ng-doc/ui-kit/types';

export abstract class NgDocDisplayValueHost<T> {
	abstract displayValueFn: NgDocDisplayValueFunction<T>;
}
