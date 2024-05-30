import { escapeHtml, NgDocPlaygroundOptions } from '@ng-doc/core';

import { getPlaygroundMetadata } from '../../../index';
import { NgDocPlaygroundMetadata } from '../../../interfaces';
import { NgDocAction } from '../../../types';

/**
 *    Renders playground point on the page, it will be rendered by the application
 * @param pId - Playground id in the config
 * @param options - Options for configuring the action
 */
export function playgroundAction(
  pId: string,
  options?: NgDocPlaygroundOptions,
): NgDocAction<string> {
  return (page) => {
    const playgroundMetadata = getPlaygroundMetadata(page.parent.entry, page.objectExpression());
    const metadata: NgDocPlaygroundMetadata | undefined = playgroundMetadata[pId];

    if (metadata) {
      return {
        output: `<ng-doc-playground id="${pId}" indexable="false">
							<div id="selectors">${metadata.selector ?? ''}</div>
							<div id="pipeName">${metadata.name ?? ''}</div>
							<div id="data">${escapeHtml(JSON.stringify(metadata.properties))}</div>
							<div id="options">${escapeHtml(JSON.stringify(options ?? {}))}</div>
						</ng-doc-playground>`,
        dependencies: [metadata.class.getSourceFile().getFilePath()],
      };
    } else {
      return { output: '' };
    }
  };
}
