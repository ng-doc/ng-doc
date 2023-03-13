/** List of playground properties, where key is't a name of the input */
export type NgDocPlaygroundProperties = Record<string, NgDocPlaygroundProperty>;

/** Playground property data */
export interface NgDocPlaygroundProperty {
	/** Type of the property  */
	type: string;
	/** The name of the property in the code (it can be different from input name) */
	name: string;
	/** Commend for the property */
	description?: string;
	/** Values that uses for the property initialization */
	default?: string;
	/** List of possible options, it can be list of Type Alias items */
	options?: string[];
}
