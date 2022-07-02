import {NgDocPlaygroundConfig} from './playground-config';

/**
 * A map of playgrounds that you can use for the page.
 */
export interface NgDocPlayground {
	/** The configuration of the playground for individual selectors, selectors can be listed separated by commas */
	[key: string]: NgDocPlaygroundConfig;
}
