import { isRoute, NgDocCategory, NgDocPage } from '@ng-doc/core';

/**
 *
 * @param entry
 */
export function getEntryRoute(entry: NgDocPage | NgDocCategory): string | undefined {
	return isRoute(entry?.route) ? entry?.route.path : entry?.route;
}
