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
  /** List of possible options, it can be list of Type Alias items */
  options?: string[];
  /** Determines if the property is manually added by the user */
  isManual?: boolean;
}
