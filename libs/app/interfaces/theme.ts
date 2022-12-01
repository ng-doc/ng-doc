/**
 * Interface describing a custom theme for the application
 */
export interface NgDocTheme {
	/**
	 * Theme ID that you can use to set theme (e.g. `CustomTheme`)
	 */
	id: Exclude<string, 'day' | 'night'>;
	/**
	 * Path that will be used to load theme dynamically (e.g. `/assets/themes/custom.css`)
	 */
	path: string;
}
