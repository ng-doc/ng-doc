/**
 * Options for the type control provider
 */
export interface NgDocTypeControlProviderOptions {
  /**
   * Allows to hide the label of the type control,
   * if the label is not needed or if you want to use a custom label
   */
  hideLabel?: boolean;
  /**
   * You can use this to change the order of the type control.
   * Controls are sorted by ascending order, and controls without an order come last.
   * NgDoc's own controls use 10 (type aliases), 20 (`string`), 30 (`number`) and 40 (`boolean`)
   */
  order?: number;
}
