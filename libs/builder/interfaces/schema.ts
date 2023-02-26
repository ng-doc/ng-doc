import {NgDocGlobalKeyword} from './keyword-map';
import {NgDocRepoConfig} from './repo-config';

export interface NgDocSchema {
	browserTarget: string;
	main: string;
	ngDoc?: NgDocConfiguration;
}

/**
 * NgDoc configuration interface, that configure NgDoc library
 */
export interface NgDocConfiguration {
	/**
	 * List of paths to your documentation location (e.g. "src/app")
	 */
	pages?: string | string[];
	/**
	 * Route prefix uses to add some additional route segment before documentation pages,
	 * you can use it e.g. to wrap documentation with additional route like "docs".
	 */
	routePrefix?: string;
	/**
	 * Tag for of the current target, you can use it in conjunction with the `onlyForTags` field in your pages to
	 * hide pages for certain documentation builds
	 */
	tag?: string;
	/**
	 * List of the global keywords, to create link to foreign websites
	 */
	keywords?: Record<string, NgDocGlobalKeyword>;
	/**
	 * The repository configuration.
	 * If it is defined, Ngoc will use it to display the "Suggest edits" button, and "View source" button, on each page.
	 */
	repoConfig?: NgDocRepoConfig;
	/**
	 * The path to the tsconfig file (NgDoc uses tsconfig of you application by default, but you can override it)
	 */
	tsConfig?: string;
}
