import { Pipe, PipeTransform } from '@angular/core';
import { extractValue } from '@ng-doc/core/helpers/extract-value';
import { NgDocExtractedValue } from '@ng-doc/core/types/extracted-value';

/**
 * Parses the string form of a value (for example a default value of a playground property).
 */
@Pipe({
  name: 'ngDocExtractValue',
})
export class NgDocExtractValuePipe implements PipeTransform {
  transform(value: string): NgDocExtractedValue {
    return extractValue(value);
  }
}
