import {ClassDeclaration, Decorator, Node, Project} from 'ts-morph';

import {declarationToPlayground} from '../../helpers/declaration-to-playground';
import {NgDocActionOutput, NgDocPlaygroundProperties} from '../../interfaces';
import {NG_DOC_PLAYGROUND_TEMPLATE_ID} from '../../naming';
import {componentDecoratorResolver} from '../../resolvers/component-decorator.resolver';
import {NgDocAction} from '../../types';
import {NgDocPageEntity} from '../entities/page.entity';

/**
 *	Render playground point on the page, it will be rendered by the application
 *
 * @param {string} playgroundId - Playground id in the config
 * @param {string} sourcePath - Path to typescript file
 * @returns {NgDocAction} - The action output
 */
export function playgroundAction(playgroundId: string): NgDocAction {
	return (project: Project, page: NgDocPageEntity): NgDocActionOutput => {
		try {
			if (!page.playground) {
				throw new Error(`Can't find the playground file for the page ${page.route}`);
			}

			const declaration: ClassDeclaration | undefined = page.playground.getTargetForPlayground(playgroundId);

			if (!declaration) {
				throw new Error(`Playground action didn't find the class declaration for the current target.`);
			}

			const decorator: Decorator | undefined =
				declaration.getDecorator('Component') ?? declaration.getDecorator('Directive');
			const decoratorArgument: Node | undefined = decorator?.getArguments()[0];
			const selectors: string = Node.isObjectLiteralExpression(decoratorArgument)
				? componentDecoratorResolver(decoratorArgument).selector?.replace(/[\n\s]/gm, '') ?? ''
				: '';

			const playgroundData: NgDocPlaygroundProperties = declarationToPlayground(declaration);

			return {
				output: `<div id="${NG_DOC_PLAYGROUND_TEMPLATE_ID}" data-playground-id="${playgroundId}" data-selectors="${selectors}">${JSON.stringify(
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
