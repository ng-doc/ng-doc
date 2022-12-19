import {getProjectTargetOptions} from '@angular/cdk/schematics';
import {JsonValue} from '@angular/compiler-cli/ngcc/src/utils';
import {ProjectDefinition, WorkspaceDefinition} from '@angular-devkit/core/src/workspace';
import {Rule, SchematicContext, Tree, UpdateRecorder} from '@angular-devkit/schematics';
import {getWorkspace} from '@schematics/angular/utility/workspace';

import {APP_COMPONENT_CONTENT} from '../constants/app-component-content';
import {Schema} from '../schema';
import {getAppTemplatePath} from '../utils/get-app-template-path';
import {getProject} from '../utils/get-project';

/**
 *
 * @param options
 */
export function addLayout(options: Schema): Rule {
	return async (tree: Tree, context: SchematicContext) => {
		context.logger.info(`[INFO]: Adding NgDoc layout to the root component...`);

		const workspace: WorkspaceDefinition = await getWorkspace(tree);
		const project: ProjectDefinition | undefined = getProject(options, workspace);

		if (!project) {
			return;
		}

		const buildOptions: Record<string, JsonValue> = getProjectTargetOptions(project, 'build');

		const appTemplatePath: string | undefined = getAppTemplatePath(tree, buildOptions['main'] as string);

		if (!appTemplatePath) {
			context.logger.error('Could not find the default main template file for this project.');

			return;
		}

		const html: Buffer | null = tree.read(appTemplatePath);

		if (html) {
			const recorder: UpdateRecorder = tree.beginUpdate(appTemplatePath);

			recorder.remove(0, html.length);
			recorder.insertLeft(0, APP_COMPONENT_CONTENT);
			tree.commitUpdate(recorder);

			context.logger.info(`[INFO]: Content of the app component was replaced with ng-doc layout.`);
		}
	};
}
