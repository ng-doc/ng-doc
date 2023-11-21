import { ProjectDefinition, WorkspaceDefinition } from '@angular-devkit/core/src/workspace';
import { Rule, SchematicContext, Tree, UpdateRecorder } from '@angular-devkit/schematics';
import { getWorkspace } from '@schematics/angular/utility/workspace';

import { APP_COMPONENT_CONTENT } from '../constants/app-component-content';
import { Schema } from '../schema';
import { getAppTemplatePath } from '../utils/get-app-template-path';
import { getMainPath } from '../utils/get-main-path';
import { getProject } from '../utils/get-project';

/**
 *
 * @param options
 */
export function addLayout(options: Schema): Rule {
	return async (tree: Tree, context: SchematicContext) => {
		const logger = context.logger.createChild('add-layout');

		context.logger.info(`[INFO]: Application layout`);
		logger.info(`🔄 Replacing the content of the root component with NgDoc layout...`);

		try {
			const workspace: WorkspaceDefinition = await getWorkspace(tree);
			const project: ProjectDefinition | undefined = getProject(options, workspace);

			if (!project) {
				logger.error(
					`❌ Target project not found. Please replace the content of the root component with NgDoc layout manually.`,
				);

				return;
			}

			const mainPath: string | undefined = getMainPath(project);
			const appTemplatePath: string | undefined = getAppTemplatePath(tree, mainPath);

			if (!appTemplatePath || !mainPath) {
				logger.error(
					'❌ Could not find the default main template file for the project. Please replace the content of the root component with NgDoc layout manually.',
				);

				return;
			}

			const html: Buffer | null = tree.read(appTemplatePath);

			if (html) {
				const recorder: UpdateRecorder = tree.beginUpdate(appTemplatePath);

				recorder.remove(0, html.length);
				recorder.insertLeft(0, APP_COMPONENT_CONTENT);
				tree.commitUpdate(recorder);

				logger.info('✅ Done!');
			}
		} catch (e) {
			logger.error(`❌ Error: ${e}`);
		}
	};
}
