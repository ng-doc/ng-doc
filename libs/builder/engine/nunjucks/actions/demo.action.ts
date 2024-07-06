import { NgDocDemoActionOptions } from '@ng-doc/core';

import { NgDocAction } from '../../../types';

/**
 *    Render demo point on the page, it will be rendered by the application
 * @param componentName - The title of the component class to render
 * @param options - Options for configuring the action
 * @returns The action output
 */
export function demoAction(
  componentName: string,
  options?: NgDocDemoActionOptions,
): NgDocAction<string> {
  return () => {
    return {
      output: `<ng-doc-demo componentName="${componentName}" indexable="false" [options]="${JSON.stringify(options ?? {})}"></ng-doc-demo>`,
    };
  };
}
