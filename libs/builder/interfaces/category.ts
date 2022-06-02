export interface NgDocCategory {
	/** The category title */
	title: string;
	/** The route of the category (current sourceFileFolder title by default) */
	route?: string;
	/** The scope of the category (project root by default) */
	scope?: string;
	/** The parent category */
	category?: NgDocCategory;
	/** Render the page only for specific build tags */
	onlyForTags?: string[];
}
