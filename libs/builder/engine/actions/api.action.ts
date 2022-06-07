import {Node, Project} from 'ts-morph';

import {findDeclaration} from '../../helpers';
import {NgDocActionOutput} from '../../interfaces';
import {NgDocAction} from '../../types';
import {NgDocPagePoint} from '../buildables/page';

/**
 *	Render API table for typescript object
 *
 * @param {string} sourcePath - Path to typescript file
 * @returns {NgDocAction} - The action output
 */
export function apiAction(sourcePath: string): NgDocAction {
	return (project: Project, page: NgDocPagePoint): NgDocActionOutput => {
		try {
			const declaration: Node = findDeclaration(project, page, sourcePath);

			return {output: ``};
		} catch (e) {
			page.builderContext.context.logger.error(`Error while building API: ${e}`);

			return {output: ``};
		}
	};
}
