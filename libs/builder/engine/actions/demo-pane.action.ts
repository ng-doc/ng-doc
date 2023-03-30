import {escapeHtml, NgDocDemoPaneActionOptions} from '@ng-doc/core';

import {NgDocActionOutput} from '../../interfaces';
import {NgDocAction} from '../../types';

/**
 *	Render demo pane point on the page, it will be rendered by the application
 *
 * @param componentName - The title of the component class to render
 * @param options - Options for configuring the action
 * @returns The action output
 */
export function demoPaneAction(componentName: string, options?: NgDocDemoPaneActionOptions): NgDocAction {
	return (): NgDocActionOutput => {
		return {
			output: `<ng-doc-demo-pane componentName="${componentName}" indexable="false">
						<div id="options">${escapeHtml(JSON.stringify(options ?? {}))}</div>
					</ng-doc-demo-pane>`,
		};
	};
}
