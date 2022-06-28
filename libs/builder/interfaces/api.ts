import {NgDocApiScope} from './api-scope';
import {NgDocCategory} from './category';

export interface NgDocApi {
	/** The page title */
	title: string;
	/** The API scopes, you can use it to define scopes for files that should be included to the API */
	scopes: NgDocApiScope[];
	/** The page category */
	category?: NgDocCategory;
	/** The route of the page (current sourceFileFolder title by default) */
	route?: string;
	/** Order is using for sorting pages and categories in sidebar */
	order?: number;
}
