import {NgDocPlaygroundDynamicContent} from './playground-dynamic-content';

/** Playground configuration */
export interface NgDocPlaygroundConfig {
	/** Selectors that will be used to create the current presentation */
	selectors: string | string[];
	/** Template that should be used to render playground */
	template: string;
	/** Dynamic content that you can provide to create content toggle */
	dynamicContent?: NgDocPlaygroundDynamicContent[];
}
