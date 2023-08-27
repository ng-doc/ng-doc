import { Type } from '@angular/core';

import { NgDocNavigation } from './navigation';
import { NgDocTocItem } from './toc-item';

/**
 * Interface for page navigation implementation
 */
export interface NgDocPageNavigation {
	/**
	 * Previous page
	 */
	prevPage?: NgDocNavigation;
	/**
	 * Next page
	 */
	nextPage?: NgDocNavigation;
}

/**
 * Interface for page breadcrumb implementation
 */
export interface NgDocPageBreadcrumb {
	/**
	 * Breadcrumb items
	 */
	breadcrumbs: string[];
}

/**
 * Interface for page table of content implementation
 */
export interface NgDocPageToc {
	/**
	 * Table of content items.
	 */
	tableOfContent: NgDocTocItem[];
}

/**
 * Page skeleton that should be used to create different parts of the page.
 *
 * You can use it to define your own components for the page navigation, breadcrumb, etc.
 */
export interface NgDocPageSkeleton {
	/**
	 * Page breadcrumbs.
	 */
	breadcrumbs?: Type<NgDocPageBreadcrumb>;
	/**
	 * Bottom page navigation.
	 */
	navigation?: Type<NgDocPageNavigation>;

	/**
	 * Table of content.
	 */
	toc?: Type<NgDocPageToc>;
}
