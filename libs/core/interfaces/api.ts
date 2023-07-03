import {NgDocApiScope} from './api-scope';
import {NgDocBaseEntity} from './base-entity';
import {NgDocCategory} from './category';

/**
 * Defines the API configuration object
 *
 * @param config - The API configuration object
 */
export function api(config: NgDocApi): NgDocApi {
	return config;
}

export interface NgDocApi extends NgDocBaseEntity {
	/** The API scopes, you can use it to define scopes for files that should be included to the API */
	scopes: NgDocApiScope[];
	/** The page category */
	category?: NgDocCategory;
}
