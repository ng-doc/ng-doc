import {Type} from '@angular/core';

import {NgDocPlaygroundDynamicContent} from './playground-dynamic-content';

/** Playground configuration */
export interface NgDocPlaygroundConfig {
	/** Component or directive that will be used for the playground */
	target: Type<unknown>;
	/** Selectors that will be used to create the current presentation (renders all possible selectors by default) */
	selectors?: string | string[];
	/** Template that should be used to render playground */
	template: string;
	/**
	 *  Dynamic content that you can provide to create content toggle
	 *  The object key should be used in the playground's
	 *  template to define the place where the current content should be rendered
	 */
	dynamicContent?: Record<string, NgDocPlaygroundDynamicContent>;
}
