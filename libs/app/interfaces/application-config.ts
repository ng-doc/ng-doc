import {NgDocTheme} from './theme';

/**
 * NgDoc application config.
 */
export interface NgDocApplicationConfig {
	/**
	 * List of themes that will be registered in the application and can be used via `NgDocThemeService`.
	 */
	themes?: NgDocTheme[];
	/**
	 * Default theme id.
	 * You can use `auto` to automatically select the theme based on the user's operating system settings.
	 */
	defaultThemeId?: string | 'auto';
}
