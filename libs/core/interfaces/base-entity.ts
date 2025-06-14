import { Route } from '@angular/router';

/**
 * Base interface for the NgDoc file entity
 */
export interface NgDocBaseEntity {
  /**
   * The entity title
   */
  title: string;
  /**
   * The route of the entity (current sourceFileFolder name by default)
   */
  route?: string | Route;

  /**
   * Order is using for sorting entities in the sidebar
   */
  order?: number;

  /**
   * If `true` the page will be hidden from the sidebar
   */
  hidden?: boolean;
}
