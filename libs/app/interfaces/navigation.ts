export interface NgDocNavigation {
	/** Title of the navigation item */
	title: string;
	/** Route of the navigation item */
	route?: string;
	/** Determines whether the category is expandable */
	expandable?: boolean;
	/** Determines whether the category should be expanded by default */
	expanded?: boolean;
	/** Children of the navigation item */
	children?: NgDocNavigation[];
	/** Order is using for sorting pages and categories in sidebar */
	order?: number;
}
