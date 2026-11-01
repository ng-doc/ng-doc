/**
 * The titles of the built-in callout types (`NgDocBlockquoteComponent`).
 */
export interface NgDocBlockquoteTexts {
  /** Title of a `note` callout. Default: "Note". */
  note: string;
  /** Title of a `warning` callout. Default: "Warning". */
  warning: string;
  /** Title of an `alert` callout. Default: "Alert". */
  alert: string;
  /** Title of a `success` callout. Default: "Success". */
  success: string;
}

/**
 * The texts of the two-pane layout (`NgDocPaneComponent`), which the demo pane uses.
 */
export interface NgDocPaneTexts {
  /** Accessible name of the resizer between the panes. Default: "Resize the panes". */
  resizer: string;
}

/**
 * The texts of the select (`NgDocComboboxComponent`), which the playground uses for union types.
 */
export interface NgDocComboboxTexts {
  /**
   * Placeholder of the text field, unless the `placeholder` input sets one. Default: "Choose the
   * value".
   */
  placeholder: string;
}

/**
 * The texts that the components of `@ng-doc/ui-kit` show to readers, grouped by component.
 * `@ng-doc/app` extends it into `NgDocTexts`, and `provideNgDocTexts` sets both.
 */
export interface NgDocUiKitTexts {
  /** Callouts. */
  blockquote: NgDocBlockquoteTexts;
  /** The two-pane layout. */
  pane: NgDocPaneTexts;
  /** The select. */
  combobox: NgDocComboboxTexts;
}
