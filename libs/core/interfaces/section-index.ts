import { NgDocPageType } from '../types';

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
  /**
   * The kind of the declaration, such as `Class` or `Component`. The new engine sets it, with
   * `signature` and `description`, on the records of an API page that belong to no section.
   */
  kind?: string;
  /**
   * The declaration header as written, such as `export class NgDocThemeService`, as plain text.
   */
  signature?: string;
  /**
   * The first paragraph of the declaration's doc comment, as one line of plain text.
   */
  description?: string;
}
