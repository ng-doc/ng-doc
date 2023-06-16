import {NgDocSandboxConfiguration} from '@ng-doc/core';

import {NgDocNavigation} from './navigation';

/**
 * Application context
 */
export interface NgDocContext {
	/**
	 * List of navigation items
	 */
	navigation: NgDocNavigation[];
	/**
	 * Sandbox configuration
	 */
	sandbox?: NgDocSandboxConfiguration
}
