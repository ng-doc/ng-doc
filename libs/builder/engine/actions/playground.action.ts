import {escapeHtml, NgDocPlaygroundProperties} from '@ng-doc/core';
import {ClassDeclaration, Decorator, Node, ObjectLiteralExpression, Project} from 'ts-morph';

import {getPlaygroundClassProperties, getTargetForPlayground} from '../../helpers';
import {NgDocActionOutput} from '../../interfaces';
import {componentDecoratorResolver} from '../../resolvers/component-decorator.resolver';
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
		try {
			const playgroundsExpression: ObjectLiteralExpression | undefined =
				page.playgroundsExpression;

			if (!playgroundsExpression) {
				throw new Error(
					`Can't find the playground configuration for "${page.route}" page. Make sure that you configured the "${pId}" playground correctly.`,
				);
			}

			const declaration: ClassDeclaration | undefined = getTargetForPlayground(playgroundsExpression, pId);

			if (!declaration) {
				throw new Error(`Playground action didn't find the class declaration for the current target.`);
			}

			const decorator: Decorator | undefined =
				declaration.getDecorator('Component') ?? declaration.getDecorator('Directive');
			const decoratorArgument: Node | undefined = decorator?.getArguments()[0];
			const selectors: string = Node.isObjectLiteralExpression(decoratorArgument)
				? componentDecoratorResolver(decoratorArgument).selector?.replace(/[\n\s]/gm, '') ?? ''
				: '';

			const playgroundData: NgDocPlaygroundProperties = getPlaygroundClassProperties(declaration);

			return {
				output: `<ng-doc-playground id="${pId}" indexable="false">
							<div id="selectors">${selectors}</div>
							<div id="data">${escapeHtml(JSON.stringify(playgroundData))}</div>
						</ng-doc-playground>`,
				dependencies: [declaration.getSourceFile().getFilePath()],
			};
		} catch (e) {
			page.logger.error(`Error while executing "playground" action: ${e}`);

			return {output: ``};
		}
	};
}
