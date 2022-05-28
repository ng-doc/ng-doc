/**
 * Page configuration
 */
export interface NgDocPage {
	/** The page template */
	mdFile: string;
	/** The page title */
	title: string;
	/** The page category */
	category?: string | NgDocPage;
	/** The route of the page */
	route?: string;
	/** The scope of the page */
	scope?: string;
}
