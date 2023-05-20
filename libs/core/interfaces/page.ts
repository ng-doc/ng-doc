import {Type} from '@angular/core';
import {NgDocPlaygroundConfig} from '@ng-doc/core/interfaces/playground-config';

import {NgDocBaseEntity} from './base-entity';
import {NgDocCategory} from './category';

/**
 * Page configuration interface, that should be used to describe configuration of the page
 */
export interface NgDocPage extends NgDocBaseEntity {
	/** The page template */
	mdFile: string;
	/** The page category */
	category?: NgDocCategory;
	/** Render the page only for specific build configuration */
	onlyForTags?: string[];
	/** Custom keyword that uses to create links to this page (`title` by default) */
	keyword?: string;
	/** Any custom data that you can provide for the page and use on it via `NgDocPage.data` */
	data?: unknown;
	/** The NgModule of your page */
	module?: Type<unknown> | any;
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
