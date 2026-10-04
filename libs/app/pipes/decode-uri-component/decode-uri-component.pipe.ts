import { Pipe, PipeTransform } from '@angular/core';

/**
 * Decodes a URI component, and returns the value unchanged when it is not a valid encoding.
 */
@Pipe({
  name: 'decodeUriComponent',
})
export class NgDocDecodeUriComponentPipe implements PipeTransform {
  transform(value: string): string {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
}
