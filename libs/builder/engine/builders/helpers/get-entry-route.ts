import { isRoute, NgDocApi, NgDocCategory, NgDocPage } from '@ng-doc/core';

/**
 *
 * @param entry
 */
export function getEntryRoute(entry: NgDocPage | NgDocCategory | NgDocApi): string | undefined {
	return isRoute(entry?.route) ? entry?.route.path : entry?.route;
}
