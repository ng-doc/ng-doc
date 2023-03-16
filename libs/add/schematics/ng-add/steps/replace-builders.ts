import {Rule, SchematicContext, Tree} from '@angular-devkit/schematics';
import {
	ProjectDefinition,
	TargetDefinition,
	updateWorkspace,
	WorkspaceDefinition,
} from '@schematics/angular/utility/workspace';

import {Schema} from '../schema';
import {getProject} from '../utils/get-project';

/**
 *
 * @param options
 */
export function replaceBuilders(options: Schema): Rule {
	return async (tree: Tree, context: SchematicContext) => {
		return updateWorkspace((workspace: WorkspaceDefinition) => {
			const logger = context.logger.createChild('replace-builders');

			context.logger.info(`[INFO]: Builders`);
			logger.info(`🔄 Replacing Angular CLI builders with @ng-doc builders...`);

			try {
				const project: ProjectDefinition | undefined = getProject(options, workspace);

				if (!project) {
					logger.error(`❌ Target project not found. Please replace builders manually.`);

					return;
				}

				const buildTarget: TargetDefinition | undefined = project.targets.get('build');
				const serveTarget: TargetDefinition | undefined = project.targets.get('serve');

				if (buildTarget) {
					buildTarget.builder = '@ng-doc/builder:browser';
				} else {
					logger.error(
						`❌ "build" target was not found, please add "@ng-doc/builder:browser" builder manually.`,
					);
				}

				if (serveTarget) {
					serveTarget.builder = '@ng-doc/builder:dev-server';
				} else {
					logger.warn(
						`❌ "serve" target was not found, please add "@ng-doc/builder:dev-server" builder manually.`,
					);
				}

				logger.info('✅ Done!');
			} catch (e) {
				logger.error(`❌ Error: ${e}`);
			}
		});
	};
}
