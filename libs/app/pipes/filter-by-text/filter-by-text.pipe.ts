import { Pipe, PipeTransform } from '@angular/core';

/**
 * Keeps the items that match a search term. By default an item matches when its string form
 * equals the term.
 */
@Pipe({
  name: 'ngDocFilterByText',
})
export class NgDocFilterByTextPipe<T> implements PipeTransform {
  transform(
    items: readonly T[],
    searchTerm: string,
    matcher: (item: T, searchTerm: string) => boolean = (item: T, s: string) => String(item) === s,
  ): readonly T[] {
    return items?.filter((item: T) => matcher(item, searchTerm)) ?? [];
  }
}
