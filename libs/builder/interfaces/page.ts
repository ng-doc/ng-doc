import {NgDocCategory} from './category';

/**
 * Page configuration interface, that should be used to describe configuration of the page
 */
export interface NgDocPage {
	/** The page template */
	mdFile: string;
	/** The page title */
	title: string;
	/** The page category */
	category?: NgDocCategory;
	/** The route of the page (current source file folder title by default) */
	route?: string;
	/** Render the page only for specific build tags */
	onlyForTags?: string[];
	/** Order is using for sorting pages and categories in sidebar */
	order?: number;
	/** Custom keyword that uses to create links to this page (`title` by default) */
	keyword?: string;
}
