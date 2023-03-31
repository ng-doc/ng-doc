import {NgDocPageType} from '@ng-doc/core';

/**
 * Interface for a page index that builder generates.
 */
export interface NgDocPageIndex {
	/**
	 * Generated breadcrumbs.
	 */
	breadcrumbs: string[];
	/**
	 * Title of the page.
	 */
	title: string;
	/**
	 * Section where the content is located.
	 */
	section: string;
	/**
	 * Indexed content
	 * Usually content maybe undefined only for the API pages that have no content/documentation.
	 */
	content?: string;
	/**
	 * The type of the page.
	 */
	pageType: NgDocPageType;
	/**
	 * The route that can be used to navigate to the page.
	 */
	route: string;
	/**
	 * The url anchor of the section
	 */
	fragment?: string;
}
