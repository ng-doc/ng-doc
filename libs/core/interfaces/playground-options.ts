/**
 * List of possible playground options
 */
export interface NgDocPlaygroundOptions {
  /**
   * List of selectors that will be used to render the playground (renders all selectors by default)
   */
  selectors?: string | string[];
  /**
   * Defines whether the playground should be expanded (false by default)
   */
  expanded?: boolean;
  /**
   * Specifies whether the side panel should be hidden (false by default)
   */
  hideSidePanel?: boolean;
  /**
   * Where the inspector (the side panel with the controls) goes: `'right'` of the demos (the
   * default), or `'bottom'`, below them, so the demos get the full width. Playgrounds narrower
   * than 640px always show it below.
   */
  inspectorPosition?: 'right' | 'bottom';
  /**
   * Whether the demo is created again each time an input changes, for components that read an
   * input only once. `true` starts with the "Recreate" setting on, and the reader can turn it off;
   * `'always'` keeps it on and hides the setting. Off by default.
   */
  recreate?: boolean | 'always';
  /**
   * Specifies input values for the playground that will be set to playground component.
   * These values will be used only once, when the playground is rendered.
   * If user resets the playground, these values will be overridden by default values.
   */
  inputs?: Record<string, unknown>;
  /**
   * Specifies default values for the playground inputs that will be used for the side panel instead of default
   * values from the component. These values **don't override** default values of the playground component
   * they will be used only for initialization and "Reset" button in the side panel.
   */
  defaults?: Record<string, unknown>;
  /**
   * List of inputs that will be hidden in the playground (e.g. `['myInputName']`)
   */
  hiddenInputs?: string[];
  /**
   * Custom data that you can use in the templates (e.g. `{{data.providedProperty}}`)
   */
  data?: Record<string, unknown>;
  /**
   * Renders the playground's demos in iframes that load only Angular and the target, instead of
   * rendering them in the page: the preview widths become real viewport widths (media queries
   * respond) and the page's styles and providers don't reach the target. The inspector stays on
   * the page. The option of the `playground` action wins over the playground configuration, which
   * wins over `isolatedPlaygrounds` of `ng-doc.config.ts` (`false` by default). Only the Vite
   * engine builds the playground pages; elsewhere the playground renders in the page.
   */
  isolated?: boolean;
}
