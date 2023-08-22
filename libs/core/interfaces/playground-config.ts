import {Type} from '@angular/core';

import {NgDocPlaygroundContent} from './playground-content';
import {NgDocPlaygroundOptions} from './playground-options';

/**
 * Playground control configuration
 */
export interface NgDocPlaygroundControlConfig {
	/**
	 * Input type that will be used to display the playground control (e.g. `string`, `number`, `boolean`, `MyOwnType`)
	 */
	type: string;
	/**
	 * Input alias that will be used to set the input value (e.g. `myInputAlias`)
	 */
	alias?: string;
	/**
	 * Input description that will be used to display the tooltip on the playground control
	 */
	description?: string;
	/**
	 * List of possible options, it can be list of Type Alias items
	 */
	options?: string[];
}

/** Playground configuration */
export interface NgDocPlaygroundConfig extends NgDocPlaygroundOptions {
	/** Component or directive that will be used for the playground */
	target: Type<unknown> | any;
	/** Template that should be used to render playground */
	template: string;
	/**
	 * List of playground controls that will be used to render the side panel.
	 * NgDoc will try to guess playground controls from the component inputs, but you can override them here
	 * or add new ones.
	 *
	 * Object key is the class property name, and value is a type of the control. If your input name and property name
	 * are different, you can provide `NgDocPlaygroundControlConfig` object instead of a string to specify the input alias.
	 */
	controls?: Record<string, string | NgDocPlaygroundControlConfig>;
	/**
	 *  Dynamic content that you can provide to create content toggle button
	 *  The object key should be used in the playground's
	 *  template to define the place where the current content should be rendered (e.g. `{{content.providedKey}}`)
	 */
	content?: Record<string, NgDocPlaygroundContent>;
}
