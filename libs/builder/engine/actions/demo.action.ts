import {NgDocActionOutput} from '../../interfaces';
import {NgDocAction} from '../../types';

/**
 *	Render demo point on the page, it will be rendered by the application
 *
 * @param {string} className - The name of the component class to render
 * @returns {NgDocAction} - The action output
 */
export function demoAction(className: string): NgDocAction {
	return (): NgDocActionOutput => {
		return {output: `<!--NgDocDemo:${className}-->`};
	};
}
