import { escapeHtml, NgDocPlaygroundOptions } from '@ng-doc/core';
import { Project } from 'ts-morph';

import { NgDocActionOutput, NgDocPlaygroundMetadata } from '../../interfaces';
import { NgDocAction } from '../../types';
import { NgDocPageEntity } from '../entities/page.entity';

/**
 *    Renders playground point on the page, it will be rendered by the application
 *
 * @param pId - Playground id in the config
 * @param options - Options for configuring the action
 */
export function playgroundAction(pId: string, options?: NgDocPlaygroundOptions): NgDocAction {
	return (project: Project, page: NgDocPageEntity): NgDocActionOutput => {
		const metadata: NgDocPlaygroundMetadata | undefined = page.playgroundEntity.metadata[pId];

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
