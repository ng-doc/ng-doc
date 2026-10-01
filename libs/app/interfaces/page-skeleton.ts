import { Signal, Type } from '@angular/core';

import { NgDocNavigation } from './navigation';
import { NgDocTocItem } from './toc-item';

/**
 * A field of a page skeleton component. The page sets it through the setInput method of the
 * component reference, so the component may declare it as a plain property or as a signal input.
 */
export type NgDocPageSkeletonField<T> = T | Signal<T | undefined>;

/**
 * Interface for page navigation implementation
 */
export interface NgDocPageNavigation {
  /**
   * Previous page
   */
  prevPage?: NgDocPageSkeletonField<NgDocNavigation | undefined>;
  /**
   * Next page
   */
  nextPage?: NgDocPageSkeletonField<NgDocNavigation | undefined>;
}

/**
 * Interface for page breadcrumb implementation
 */
export interface NgDocPageBreadcrumbs {
  /**
   * Breadcrumb items
   */
  breadcrumbs: NgDocPageSkeletonField<string[]>;
}

/**
 * Interface for page table of content implementation
 */
export interface NgDocPageToc {
  /**
   * Table of content items.
   */
  tableOfContent: NgDocPageSkeletonField<NgDocTocItem[]>;
  /**
   * URL where the reader can edit the page source. The page sets it only on components that
   * declare this input.
   */
  editSourceFileUrl?: NgDocPageSkeletonField<string | undefined>;
  /**
   * The symbol details of an API page (kind, decorators, heritage, scope) as an element to show
   * in the rail. The page sets it only on components that declare this input, and moves the
   * element out of the content; other components leave it hidden in the content.
   */
  details?: NgDocPageSkeletonField<Element | undefined>;
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
  breadcrumbs?: Type<NgDocPageBreadcrumbs>;
  /**
   * Bottom page navigation.
   */
  navigation?: Type<NgDocPageNavigation>;

  /**
   * Table of content.
   */
  toc?: Type<NgDocPageToc>;
}
