import {Pipe, PipeTransform} from '@angular/core';
import {asArray} from '@ng-doc/ui-kit/helpers';

@Pipe({
	name: 'asArray',
})
export class NgDocAsArrayPipe implements PipeTransform {
	transform<T>(value: T | T[] | Iterable<T> | null | undefined): T[] {
		return asArray(value);
	}
}
