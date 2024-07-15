import { Component, Type } from '@angular/core';

import { NgDocBaseEntity } from './base-entity';
import { NgDocCategory } from './category';
import { NgDocPlaygroundConfig } from './playground-config';

/**
 * Page configuration interface, that should be used to describe configuration of the page
 */
export interface NgDocPage extends NgDocBaseEntity {
  /**
   * The page description that will be shown under the title
   */
  description?: string;
  /**
   * Path to the page markdown file
   */
  mdFile: string | string[];
  /**
   * The page category
   */
  category?: NgDocCategory;
  /**
   *  Render the page only for specific build configuration
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
