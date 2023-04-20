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
	 * You can use this to change the order of the type control
	 * NgDoc's controls start at 5 and go up to 10
	 */
	order?: number;
}
