import {NgDocDemoActionOptions} from '@ng-doc/builder';

import {NgDocActionOutput} from '../../interfaces';
import {NG_DOC_DEMO_TEMPLATE_ID} from '../../naming';
import {NgDocAction} from '../../types';

/**
 *	Render demo point on the page, it will be rendered by the application
 *
 * @param {string} componentName - The title of the component class to render
 * @param {NgDocDemoActionOptions} options - Options for configuring the action
 * @returns {NgDocAction} - The action output
 */
export function demoAction(componentName: string, options?: NgDocDemoActionOptions): NgDocAction {
	return (): NgDocActionOutput => {
		return {
			output: `<div id="${NG_DOC_DEMO_TEMPLATE_ID}"data-component-name="${componentName}" data-container="${
				options?.container ?? true
			}"></div>`,
		};
	};
}
