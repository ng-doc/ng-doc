import { EnvironmentProviders, Provider } from '@angular/core';

export interface NgDocBaseDemoOptions {
  /**
   * Opens the demo on its code (false by default): a `demo` starts on a source file instead of the
   * preview (the `opened` snippet, then `defaultTab`, then the first file), and a `demoPane` starts
   * with its code expanded.
   */
  expanded?: boolean;
  /** Tab name that should be opened by default */
  defaultTab?: string;
  /**
   * A child route of the page (see `route.children` of `NgDocPage`). When set, a link that opens
   * the route in a new tab replaces the demo; the route opens as a standalone page that shows only
   * the routed component.
   */
  fullscreenRoute?: string;
  /** List of tabs that should be displayed if they are not empty and exist */
  tabs?: string | string[];
  /** Class name that should be added to the container */
  class?: string | string[];
  /**
   * Specifies input values for the demo that will be set to demo component.
   * These values will be used only once, when the demo is rendered.
   */
  inputs?: Record<string, unknown>;
}

/**
 * Possible options for `demo` action
 */
export interface NgDocDemoActionOptions extends NgDocBaseDemoOptions {
  /** Display demo in the container (true by default) */
  container?: boolean;
  /**
   * Shows the demo in an iframe that loads only Angular and the demo, instead of rendering it in
   * the page: the preview widths become real viewport widths (media queries respond) and the
   * page's styles and providers don't reach the demo. The default is `isolatedDemos` of
   * `ng-doc.config.ts` (`false`). Only the Vite engine builds the demo pages; elsewhere the demo
   * renders in the page.
   */
  isolated?: boolean;
}

/**
 * Possible options for `demoPane` action
 */
export type NgDocDemoPaneActionOptions = NgDocBaseDemoOptions;

/**
 * The providers of the demo application, which shows isolated demos: what the module named by
 * `demoProviders` in `ng-doc.config.ts` exports by default.
 */
export type NgDocDemoProviders = Array<Provider | EnvironmentProviders>;

/**
 * Imports the module that provides the demo application's providers, written as
 * `() => import('./demo.providers')`. NgDoc never calls it while it generates: the demo
 * application imports the module in the browser and on the server.
 */
export type NgDocDemoProvidersImport = () => Promise<{ default: NgDocDemoProviders }>;
