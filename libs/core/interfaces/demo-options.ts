export interface NgDocBaseDemoOptions {
  /** Specifies whether the code preview should be expanded (false by default) */
  expanded?: boolean;
  /** Tab name that should be opened by default */
  defaultTab?: string;
  /** If specified, fullscreen button will be displayed and will navigate to the specified route */
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
}

/**
 * Possible options for `demoPane` action
 */
export type NgDocDemoPaneActionOptions = NgDocBaseDemoOptions;
