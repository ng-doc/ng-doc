import { StructuredDoc } from '@ng-doc/builder';
import { isPresent } from '@ng-doc/core/helpers/is-present';

/**
 *
 * @param entries
 */
export function sortNavigationEntries(entries: StructuredDoc[]): StructuredDoc[] {
  return entries.sort((a: StructuredDoc, b: StructuredDoc) => {
    if (isPresent(a.item.order) && isPresent(b.item.order)) {
      return a.item.order - b.item.order;
    }
    if (isPresent(a.item.order)) {
      return -1;
    }
    if (isPresent(b.item.order)) {
      return 1;
    }

    return a.item.title.localeCompare(b.item.title);
  });
}
