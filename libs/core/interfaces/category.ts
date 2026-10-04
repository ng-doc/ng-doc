import { Route } from '@angular/router';

import { NgDocBaseEntity } from './base-entity';

export interface NgDocCategory extends NgDocBaseEntity {
  /** The parent category */
  category?: NgDocCategory;
  /**
   * Build tags this category is rendered for. The category is part of a build only when the build
   * has at least one of these tags; otherwise it and everything in it (child categories, pages and
   * API pages) is left out, as if it did not exist. A category without `onlyForTags` is part of
   * every build.
   *
   * With the new generator engine (the Vite plugin, the `vite-*` builders and the `ng-doc` CLI),
   * the build tags are:
   * - Vite plugin and `vite-*` builders: the Vite mode (`development` for the dev server,
   *   `production` for a build, or the builders' `mode` option), or `generator.discovery.tags`;
   * - `ng-doc` CLI: `production` for `generate`, `development` for `dev` and `watch`, or `--tags`.
   *
   * `null` or an empty string means no filter; an empty array hides the entry in every build.
   * The legacy `application`/`dev-server` builders ignore this option.
   */
  onlyForTags?: string[];
  /** Determines whether the category is expandable */
  expandable?: boolean;
  /** Determines whether the category should be expanded by default */
  expanded?: boolean;
  route?: string;
  providers?: Route['providers'];
}
