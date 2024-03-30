import { NgDocPageType } from '@ng-doc/core';

export interface MarkdownEntry {
  /**
   * The title of the page that will be used in the tab title
   */
  title: string;
  /**
   * Custom icon that will be used when page is displayed as a tab
   */
  icon?: string;
  /**
   * The type of the page, will be used to modify the type of the keyword and type of th page in the search engine.
   *
   * For the `guide` type the keyword should be used with asterisk (*) at the beginning of the keyword. (e.g. `*MyGuide`)
   * For the `api` type the keyword should be as it is. (e.g. `MyApi`), this will also enable possibility to create links to methods and properties.
   */
  type: NgDocPageType;
  /**
   * The route of the tab page
   */
  route?: string;
  /**
   * Custom keyword that uses to create links to this page
   */
  keyword?: string;
}
