import {escapeHtml} from '@ng-doc/core';
import {Project} from 'ts-morph';

import {NgDocActionOutput, NgDocPlaygroundMetadata} from '../../interfaces';
import {NgDocAction} from '../../types';
import {NgDocPageEntity} from '../entities/page.entity';

/**
 *	Render playground point on the page, it will be rendered by the application
 *
 * @param {string} pId - Playground id in the config
 * @param {string} sourcePath - Path to typescript file
 * @returns {NgDocAction} - The action output
 */
export function playgroundAction(pId: string): NgDocAction {
	return (project: Project, page: NgDocPageEntity): NgDocActionOutput => {
		const metadata: NgDocPlaygroundMetadata | undefined = page.playgroundMetadata[pId];

		if (metadata) {
			return {
				output: `<ng-doc-playground id="${pId}" indexable="false">
							<div id="selectors">${metadata.selector ?? ''}</div>
							<div id="pipeName">${metadata.name ?? ''}</div>
							<div id="data">${escapeHtml(JSON.stringify(metadata.properties))}</div>
						</ng-doc-playground>`,
				dependencies: [metadata.class.getSourceFile().getFilePath()],
			};
		} else {
			throw new Error(
				`Metadata for playground "${pId}" not found. Make sure that you configured the playgrounds correctly or using correct playground id.`,
			);
		}
	};
}
