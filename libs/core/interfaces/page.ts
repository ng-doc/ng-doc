import { Component, Type } from '@angular/core';

import { NgDocBaseEntity } from './base-entity';
import { NgDocCategory } from './category';
import { NgDocPlaygroundConfig } from './playground-config';

/**
 * Page configuration interface, that should be used to describe configuration of the page
 */
export interface NgDocPage extends NgDocBaseEntity {
  /**
   * Path to the page markdown file
   */
  mdFile: string | string[];
  /**
   * The page category
   */
  category?: NgDocCategory;
  /**
   * Build tags this page is rendered for. The page is part of a build only when the build has at
   * least one of these tags; otherwise it has no route, navigation item, search entry or keyword,
   * as if it did not exist. A page without `onlyForTags` is part of every build.
   *
   * With the new generator engine (the `modern-*` builders, the Vite plugin and the `ng-doc` CLI),
   * the build tags are:
   * - Angular CLI builders: the build configuration name(s), e.g. `production` or `development`
   *   (the target's `defaultConfiguration` when none is given), or the `ngDoc.tags` option;
   * - Vite plugin: the Vite mode (`development` for the dev server, `production` for
   *   `vite build`), or `generator.discovery.tags`;
   * - `ng-doc` CLI: `production` for `generate`, `development` for `dev` and `watch`, or `--tags`.
   *
   * `null` or an empty string means no filter; an empty array hides the entry in every build.
   * The legacy `application`/`dev-server` builders ignore this option.
   */
  onlyForTags?: string[];
  /**
   * Any custom data that you can provide for the page and use on it via `NgDocPage.data`
   */
  data?: unknown;
  /**
   * Import Angular dependencies for the page.
   * If you are using standalone components for demos and playgrounds, you don't need to import anything.
   */
  imports?: Component['imports'];
  /**
   * List of providers for the page they will be available for all components on the page
   */
  providers?: Component['providers'];
  /**
   * The page demo components should be on object where key it's
   * the component's class name and value it's class constructor
   */
  demos?: Record<string, Type<unknown> | any>;
  /**
   * The page playgrounds should be on object where key it's the
   * playground's name and value its playground configuration
   */
  playgrounds?: Record<string, NgDocPlaygroundConfig>;
  /**
   * By default, the child routes of a page are shown in a fullscreen dialog.
   * Set disableFullscreenRoutes to false to handle them yourself with a <router-outlet />.
   * It can be used for example in a demo that requires to show nested routes.
   * Be careful however, only 1 router-outlet is allowed level, that can lead to collisions if
   * multiple demos on the same page require nested routes.
   */
  disableFullscreenRoutes?: boolean;
}
