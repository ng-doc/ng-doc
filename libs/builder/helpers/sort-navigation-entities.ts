import {isPresent} from '@ng-doc/core/helpers/is-present';

import {NgDocNavigationEntity} from '../engine/entities/abstractions/navigation.entity';

/**
 *
 * @param entities
 */
export function sortNavigationEntities<T>(entities: Array<NgDocNavigationEntity<T>>): Array<NgDocNavigationEntity<T>> {
	return entities.sort((a: NgDocNavigationEntity<T>, b: NgDocNavigationEntity<T>) => {
		if (isPresent(a.order) && isPresent(b.order)) {
			return a.order - b.order;
		}
		if (isPresent(a.order)) {
			return -1;
		}
		if (isPresent(b.order)) {
			return 1;
		}
		return a.title.localeCompare(b.title);
	});
}
