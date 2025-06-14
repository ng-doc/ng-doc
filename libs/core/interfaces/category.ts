import { Route } from '@angular/router';

import { NgDocBaseEntity } from './base-entity';

export interface NgDocCategory extends NgDocBaseEntity {
  /** The parent category */
  category?: NgDocCategory;
  /** Render the page only for specific build tags */
  onlyForTags?: string[];
  /** Determines whether the category is expandable */
  expandable?: boolean;
  /** Determines whether the category should be expanded by default */
  expanded?: boolean;
  route?: string;
  providers?: Route['providers'];
}
