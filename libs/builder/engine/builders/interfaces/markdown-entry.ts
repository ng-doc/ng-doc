/**
 * Represents a markdown metadata properties
 */
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
   * The route of the tab page
   */
  route?: string;
  /**
   * Custom keyword that uses to create links to this page
   */
  keyword?: string;
}
