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
	/** The route of the page */
	route?: string;
	/** The scope of the page */
	scope?: string;
}
