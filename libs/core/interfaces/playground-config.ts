import {Type} from '@angular/core';

import {NgDocPlaygroundContent} from './playground-content';
import {NgDocPlaygroundOptions} from './playground-options';

/** Playground configuration */
export interface NgDocPlaygroundConfig extends NgDocPlaygroundOptions {
	/** Component or directive that will be used for the playground */
	target: Type<unknown> | any;
	/** Template that should be used to render playground */
	template: string;
	/**
	 *  Dynamic content that you can provide to create content toggle button
	 *  The object key should be used in the playground's
	 *  template to define the place where the current content should be rendered (e.g. `{{content.providedKey}}`)
	 */
	content?: Record<string, NgDocPlaygroundContent>;
}
