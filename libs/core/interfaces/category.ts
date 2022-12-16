export interface NgDocCategory {
	/** The category title */
	title: string;
	/** The route of the category (current sourceFileFolder title by default) */
	route?: string;
	/** The parent category */
	category?: NgDocCategory;
	/** Render the page only for specific build tags */
	onlyForTags?: string[];
	/** Determines whether the category is expandable */
	expandable?: boolean;
	/** Determines whether the category should be expanded by default */
	expanded?: boolean;
	/** Order is using for sorting pages and categories in sidebar */
	order?: number;
}
