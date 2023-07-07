import {NgDocApiScope} from './api-scope';
import {NgDocBaseEntity} from './base-entity';
import {NgDocCategory} from './category';

export interface NgDocApi extends NgDocBaseEntity {
	/** The API scopes, you can use it to define scopes for files that should be included to the API */
	scopes: NgDocApiScope[];
	/** The page category */
	category?: NgDocCategory;
}
