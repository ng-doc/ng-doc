import {Type} from '@angular/core';

/**
 * A map of dependencies that should be used in a demo page.
 */
export interface NgDocDependencies {
	/** The page modules */
	module?: Type<unknown>;
	/** The page demo components should be on object where key it's the component's class name and value it's class constructor */
	demo?: Record<string, Type<unknown>>;
}
