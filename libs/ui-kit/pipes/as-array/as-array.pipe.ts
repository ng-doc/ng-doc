import {Pipe, PipeTransform} from '@angular/core';
import {asArray} from '@ng-doc/core';

@Pipe({
	name: 'asArray',
})
export class NgDocAsArrayPipe implements PipeTransform {
	transform<T>(value: T | T[] | Iterable<T> | null | undefined): T[] {
		return asArray(value);
	}
}
