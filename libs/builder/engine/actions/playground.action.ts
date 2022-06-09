import {NgDocActionOutput} from '../../interfaces';
import {NG_DOC_PLAYGROUND_TEMPLATE_ID} from '../../naming';
import {NgDocAction} from '../../types';

/**
 *	Render playground point on the page, it will be rendered by the application
 *
 * @param {string} sourcePath - Path to typescript file
 * @returns {NgDocAction} - The action output
 */
export function playgroundAction(sourcePath: string): NgDocAction {
	return (): NgDocActionOutput => {
		return {output: `<div id="${NG_DOC_PLAYGROUND_TEMPLATE_ID}"></div>`};
	};
}
