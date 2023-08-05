import {Route} from '@angular/router';

import {isPresent} from './is-present';

/**
 *
 * @param route
 */
export function isRoute(route?: string | Route): route is Route {
	return isPresent(route) && typeof route !== 'string';
}
