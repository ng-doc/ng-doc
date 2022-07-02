import {NgDocPlaygroundProperties} from '@ng-doc/builder';
import {Node, Project} from 'ts-morph';

import {findDeclaration} from '../../helpers';
import {declarationToPlayground} from '../../helpers/declaration-to-playground';
import {NgDocActionOutput} from '../../interfaces';
import {NG_DOC_PLAYGROUND_TEMPLATE_ID} from '../../naming';
import {NgDocAction} from '../../types';
import {NgDocPageEntity} from '../entities/page.entity';

/**
 *	Render playground point on the page, it will be rendered by the application
 *
 * @param {string} playgroundId - Playground id in the config
 * @param {string} sourcePath - Path to typescript file
 * @returns {NgDocAction} - The action output
 */
export function playgroundAction(playgroundId: string, sourcePath: string): NgDocAction {
	return (project: Project, page: NgDocPageEntity): NgDocActionOutput => {
		try {
			const declaration: Node = findDeclaration(project, page.scope, sourcePath);

			if (!Node.isClassDeclaration(declaration)) {
				throw new Error(`Playground action works only with class declarations!`);
			}

			const playgroundData: NgDocPlaygroundProperties = declarationToPlayground(declaration);

			return {
				output: `<div id="${NG_DOC_PLAYGROUND_TEMPLATE_ID}" data-playground-id="${playgroundId}">${JSON.stringify(
					playgroundData,
				)}</div>`,
				dependencies: [declaration.getSourceFile().getFilePath()],
			};
		} catch (e) {
			page.logger.error(`Error while executing "playground" action: ${e}`);

			return {output: ``};
		}
	};
}
