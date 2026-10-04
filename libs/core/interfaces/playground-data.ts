/** List of playground properties, where key is't a name of property */
export type NgDocPlaygroundProperties = Record<string, NgDocPlaygroundProperty>;

/** Playground property data */
export interface NgDocPlaygroundProperty {
  /** Type of the property  */
  type: string;
  /** The name of the input in the code (it can be different from property name) */
  inputName: string;
  /** Commend for the property */
  description?: string;
  /**
   * List of possible options: the members of a union type as written in code (such as `'small'`,
   * evaluated by the playground), plain values when `isManual` is set, or the name and value of an
   * enum member
   */
  options?: Array<string | NgDocPlaygroundOption>;
  /** Determines if the property is manually added by the user */
  isManual?: boolean;
  /** The name shown in the inspector instead of `inputName`, from the playground's `controls` */
  label?: string;
  /** The group the inspector lists the property under, from the playground's `controls` */
  group?: string;
  /** The position of the property in the inspector, from the playground's `controls` */
  order?: number;
}

/** An option of a playground property that is shown by a name other than its value */
export interface NgDocPlaygroundOption {
  /** The text shown for the option, such as the name of an enum member (`Good`) */
  label: string;
  /** The value the option sets, such as the value of an enum member (`'good'` or `0`) */
  value: string | number;
}
