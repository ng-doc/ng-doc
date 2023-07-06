import {dasherize} from '@angular-devkit/core/src/utils/strings';

/**
 * Returns a dasherized title
 *
 * @param title - The title to dasherize
 */
export function getTitle(title: string): string {
	return dasherize(title)
		.replace(/^(\/)/g, '')
		.replace(/(\/)$/g, '')
		.replace(/\//g, '-');
}
