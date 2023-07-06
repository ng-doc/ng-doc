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
	 * Custom data that you can use in the templates (e.g. `{{data.providedProperty}}`)
	 */
	data?: Record<string, unknown>;
}
