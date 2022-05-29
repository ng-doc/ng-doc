export interface NgDocCategory {
	title: string;
	route?: string;
	scope?: string;
	category?: NgDocCategory;
}
