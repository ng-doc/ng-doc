import {NgDocBaseEntity} from './base-entity';
import {NgDocCategory} from './category';

/**
 * Page configuration interface, that should be used to describe configuration of the page
 */
export interface NgDocPage extends NgDocBaseEntity {
	/** The page template */
	mdFile: string;
	/** The page category */
	category?: NgDocCategory;
	/** Render the page only for specific build configuration */
	onlyForTags?: string[];
	/** Custom keyword that uses to create links to this page (`title` by default) */
	keyword?: string;
	/** Any custom data that you can provide for the page and use on it via `NgDocPage.data` */
	data?: unknown;
}
