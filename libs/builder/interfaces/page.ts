/**
 * Page configuration
 */
import {NgDocCategory} from './category';

export interface NgDocPage {
	/** The page template */
	mdFile: string;
	/** The page title */
	title: string;
	/** The page category */
	category?: NgDocCategory;
	/** The route of the page (current sourceFileFolder title by default) */
	route?: string;
	/** The scope of the page (project root by default) */
	scope?: string;
	/** Render the page only for specific build tags */
	onlyForTags?: string[];
}
