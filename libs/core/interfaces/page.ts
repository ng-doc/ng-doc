import {Component, Type} from '@angular/core';
import {NgDocPlaygroundConfig} from '@ng-doc/core/interfaces/playground-config';
import {NgDocSandboxConfiguration} from '@ng-doc/core/interfaces/sandbox-configuration';

import {NgDocBaseEntity} from './base-entity';
import {NgDocCategory} from './category';

/**
 * Page configuration interface, that should be used to describe configuration of the page
 */
export interface NgDocPage extends NgDocBaseEntity {
	/**
	 * Path to the page markdown file
	 */
	mdFile: string;
	/**
	 * The page category
	 */
	category?: NgDocCategory;
	/**
	 *  Render the page only for specific build configuration
	 */
	onlyForTags?: string[];
	/**
	 * Custom keyword that uses to create links to this page
	 */
	keyword?: string | string[];
	/**
	 * Any custom data that you can provide for the page and use on it via `NgDocPage.data`
	 */
	data?: unknown;
	/**
	 * Import Angular dependencies for the page.
	 * If you are using standalone components for demos and playgrounds, you don't need to import anything.
	 */
	imports?: Component['imports'];
	/**
	 * List of providers for the page they will be available for all components on the page
	 */
	providers?: Component['providers'];
	/**
	 * The page demo components should be on object where key it's
	 * the component's class name and value it's class constructor
	 */
	demos?: Record<string, Type<unknown> | any>;
	/**
	 * The page playgrounds should be on object where key it's the
	 * playground's name and value its playground configuration
	 */
	playgrounds?: Record<string, NgDocPlaygroundConfig>;
	/**
	 * The sandbox configuration for the page's demos.
	 * You can use it to add or override default sandbox configuration defined in the `ng-doc.config.ts`
	 */
	sandbox?: NgDocSandboxConfiguration;
}
