import {Type} from '@angular/core';
import {NgDocPlaygroundConfig} from '@ng-doc/core';

/**
 * A map of dependencies that should be used in a demo page.
 */
export interface NgDocDependencies {
	/** The NgModule of your page */
	module: Type<unknown> | any;
	/**
	 * The page demo components should be on object where key it's
	 * the component's class name and value it's class constructor
	 */
	demo?: Record<string, Type<unknown> | any>;
	/**
	 * The page playgrounds should be on object where key it's the
	 * playground's name and value its playground configuration
	 */
	playgrounds?: Record<string, NgDocPlaygroundConfig>;
}
