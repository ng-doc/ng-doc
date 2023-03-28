import {NgDocBaseEntity} from '@ng-doc/core/interfaces';

/**
 * Navigation item interface
 */
export interface NgDocNavigation extends NgDocBaseEntity {
	expandable?: boolean;
	/** Determines whether the category should be expanded by default */
	expanded?: boolean;
	/** Children of the navigation item */
	children?: NgDocNavigation[];
}
