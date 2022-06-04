import {NgDocActionOutput} from '../../interfaces';
import {NG_DOC_DEMO_TEMPLATE_ID} from '../../naming';
import {NgDocAction} from '../../types';

/**
 *	Render demo point on the page, it will be rendered by the application
 *
 * @param {string} componentName - The title of the component class to render
 * @returns {NgDocAction} - The action output
 */
export function demoAction(componentName: string): NgDocAction {
	return (): NgDocActionOutput => {
		return {output: `<div id="${NG_DOC_DEMO_TEMPLATE_ID}" data-component-name="${componentName}"></div>`};
	};
}
