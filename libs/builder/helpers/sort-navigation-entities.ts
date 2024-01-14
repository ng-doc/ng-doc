import { StructuredDoc } from '@ng-doc/builder';
import { isPresent } from '@ng-doc/core/helpers/is-present';

/**
 *
 * @param entries
 */
export function sortNavigationEntries(entries: StructuredDoc[]): StructuredDoc[] {
	return entries.sort((a: StructuredDoc, b: StructuredDoc) => {
		if (isPresent(a.item.entry.order) && isPresent(b.item.entry.order)) {
			return a.item.entry.order - b.item.entry.order;
		}
		if (isPresent(a.item.entry.order)) {
			return -1;
		}
		if (isPresent(b.item.entry.order)) {
			return 1;
		}
		return a.item.entry.title.localeCompare(b.item.entry.title);
	});
}
