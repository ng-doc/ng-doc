import {Pipe, PipeTransform} from '@angular/core';
import {extractValue, NgDocExtractedValue} from '@ng-doc/core';

@Pipe({
	name: 'ngDocExtractValue',
})
export class NgDocExtractValuePipe implements PipeTransform {
	transform(value: string): NgDocExtractedValue {
		return extractValue(value);
	}
}
