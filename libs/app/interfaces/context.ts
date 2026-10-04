import { NgDocNavigation } from './navigation';

/**
 * Application context
 */
export interface NgDocContext {
  /**
   * List of navigation items
   */
  navigation: NgDocNavigation[];
  /**
   * The segments of the site's API lists (`assets/ng-doc/<segment>/api-list.json`, an empty string
   * for the root list). The new engine generates it, so the search palette requests only these
   * lists; without it, the palette finds them in the router configuration.
   */
  apiLists?: string[];
}
