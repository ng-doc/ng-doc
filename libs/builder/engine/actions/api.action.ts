import {Node, Project} from 'ts-morph';

import {findDeclaration} from '../../helpers';
import {NgDocActionOutput} from '../../interfaces';
import {NgDocApiEnv} from '../../templates-env/api.env';
import {NgDocAction} from '../../types';
import {NgDocPageEntity} from '../entities/page.entity';
import {NgDocRenderer} from '../renderer';

/**
 *	Render API table for typescript object
 *
 * @param {string} sourcePath - Path to typescript file
 * @returns {NgDocAction} - The action output
 */
export function apiAction(sourcePath: string): NgDocAction {
	return (project: Project, page: NgDocPageEntity): NgDocActionOutput => {
		try {
			const declaration: Node = findDeclaration(project, page.scope, sourcePath);
			const renderer: NgDocRenderer<NgDocApiEnv> = new NgDocRenderer<NgDocApiEnv>({
				declaration
			});

			return {
				output: renderer.renderSync('actions/api.md.nunj'),
				dependencies: [declaration.getSourceFile().getFilePath()],
			};
		} catch (e) {
			page.logger.error(`Error while executing "api" action: ${e}`);

			return {output: ``};
		}
	};
}
