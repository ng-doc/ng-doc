import { ControlValueAccessor } from '@angular/forms';

/**
 * Interface describing Type Control
 */
export interface NgDocTypeControl<T = unknown> extends ControlValueAccessor {
	/**
	 * The name of the input for which it is created
	 */
	name?: string;
	/**
	 * The description of the input (based on the comment)
	 */
	description?: string;
	/**
	 * The default value of the input
	 */
	default?: T;
	/**
	 * The list of possible values, it usually works only for Type Aliases which has several values
	 */
	options?: string[];
	/**
	 * Determines if the property is manually added by the user using `controls` property in playground config
	 */
	isManual?: boolean;
}
