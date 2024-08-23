import { JSDocMetadata, NgDocBaseEntity } from '@ng-doc/core/interfaces';

/**
 * Navigation item interface
 */
export interface NgDocNavigation extends NgDocBaseEntity {
  expandable?: boolean;
  /** Determines whether the category should be expanded by default */
  expanded?: boolean;
  /** Children of the navigation item */
  children?: NgDocNavigation[];
  /** The route of the entity (current sourceFileFolder name by default) */
  route: string;
  /**
   * The item metadata.
   * Collects all tags based on the JSDoc tags for `NgDocPage` or `NgDocCategory`
   * entities.
   */
  metadata?: JSDocMetadata;
}
