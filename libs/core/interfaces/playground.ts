import {NgDocPlaygroundConfig} from './playground-config';

/**
 * A map of playgrounds that you can use for the page.
 */
export interface NgDocPlayground {
	/** The configuration of the playground, they key of the playground configuration you can use to display playground on the page */
	[key: string]: NgDocPlaygroundConfig;
}
