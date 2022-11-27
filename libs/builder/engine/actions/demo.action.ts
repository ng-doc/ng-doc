import {NgDocActionOutput} from '../../interfaces';
import {NgDocAction} from '../../types';
import {NgDocDemoActionOptions} from '../interfaces';

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
			output: `<ng-doc-demo componentName="${componentName}" container="${
				options?.container ?? true
			}"></ng-doc-demo>`,
		};
	};
}
