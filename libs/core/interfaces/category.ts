import {NgDocBaseEntity} from './base-entity';

/**
 * Defines the category configuration object
 *
 * @param config - The category configuration object
 */
export function category(config: NgDocCategory): NgDocCategory {
	return config;
}

export interface NgDocCategory extends NgDocBaseEntity {
	/** The parent category */
	category?: NgDocCategory;
	/** Render the page only for specific build tags */
	onlyForTags?: string[];
	/** Determines whether the category is expandable */
	expandable?: boolean;
	/** Determines whether the category should be expanded by default */
	expanded?: boolean;
}
