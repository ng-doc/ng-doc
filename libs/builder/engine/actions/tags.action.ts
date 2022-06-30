import {Node, Project} from 'ts-morph';

import {findDeclaration} from '../../helpers';
import {NgDocActionOutput} from '../../interfaces';
import {NG_DOC_TAG_TEMPLATE_ID} from '../../naming';
import {NgDocApiEnv} from '../../templates-env/api.env';
import {NgDocTagsEnv} from '../../templates-env/tags.env';
import {NgDocAction} from '../../types';
import {NgDocPageEntity} from '../entities';
import {NgDocRenderer} from '../renderer';

/**
 *	Render tags for typescript declaration
 *
 * @param {string} sourcePath - Path to typescript file
 * @returns {NgDocAction} - The action output
 */
export function tagsAction(sourcePath: string): NgDocAction {
	return (project: Project, page: NgDocPageEntity): NgDocActionOutput => {
		try {
			const declaration: Node = findDeclaration(project, page, sourcePath);
			const renderer: NgDocRenderer<NgDocTagsEnv> = new NgDocRenderer<NgDocTagsEnv>({
				Node,
				declaration,
			});

			return {
				output: renderer.renderSync('actions/tags.md.nunj'),
				dependencies: [declaration.getSourceFile().getFilePath()],
			};
		} catch (e) {
			page.logger.error(`Error while executing TAGS action: ${e}`);

			return {output: ``};
		}
	};
}
