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
			context.logger.info(`[INFO]: Replacing default builders...`);

			const project: ProjectDefinition | undefined = getProject(options, workspace);

			if (!project) {
				context.logger.warn(`[WARNING]: Target project not found.`);
				return;
			}

			const buildTarget: TargetDefinition | undefined = project.targets.get('build');
			const serveTarget: TargetDefinition | undefined = project.targets.get('serve');

			if (buildTarget) {
				buildTarget.builder = '@ng-doc/builder:browser';

				Object.keys(buildTarget.configurations as any).forEach((config: string) => {
					(buildTarget.configurations as any)[config].ngDoc = {
						pages: project.sourceRoot,
					};
				});
				context.logger.info(`[INFO]: The page path for "build" target is set to "${project.sourceRoot}"`);
			} else {
				context.logger.warn(`[WARNING]: "build" target was not found, please add @ng-doc builder manually.`);
			}

			if (serveTarget) {
				serveTarget.builder = '@ng-doc/builder:dev-server';

				Object.keys(serveTarget.configurations as any).forEach((config: string) => {
					(serveTarget.configurations as any)[config].ngDoc = {
						pages: project.sourceRoot,
					};
				});
				context.logger.info(`[INFO]: The page path for "serve" target is set to "${project.sourceRoot}"`);
			} else {
				context.logger.warn(`[WARNING]: "serve" target was not found, please add @ng-doc builder manually.`);
			}
		});
	};
}
