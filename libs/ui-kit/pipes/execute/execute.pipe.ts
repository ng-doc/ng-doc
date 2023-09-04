import { Pipe, PipeTransform } from '@angular/core';
import { FunctionType } from '@ng-doc/core';

@Pipe({
	name: 'execute',
	standalone: true,
})
export class NgDocExecutePipe implements PipeTransform {
	transform<F extends FunctionType>(fn: F, ...args: Parameters<F>): ReturnType<F> {
		return fn(...args);
	}
}
