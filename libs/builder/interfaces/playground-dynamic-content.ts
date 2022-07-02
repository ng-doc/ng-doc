/** Configuration of playground's dynamic content */
export interface NgDocPlaygroundDynamicContent {
	/**
	 * Id of the content, that should be used in the playground's
	 * template to define the place where the current content should be rendered
	 */
	id: string;
	/** Label of the content, will be used in the playground to display toggle */
	label: string;
	/** Template of the current dynamic content */
	template: string;
}
