import {Rule, SchematicContext, Tree} from '@angular-devkit/schematics';
import {
	ProjectDefinition,
	TargetDefinition,
	updateWorkspace,
	WorkspaceDefinition,
} from '@schematics/angular/utility/workspace';
import {JSONFile} from 'ng-morph';

import {Schema} from '../schema';
import {getProject} from '../utils/get-project';

/**
 *
 * @param options
 */
export function updateAppTsConfig(options: Schema): Rule {
	return async (tree: Tree, context: SchematicContext) => {
		return updateWorkspace((workspace: WorkspaceDefinition) => {
			context.logger.info(`[INFO]: Updating application tsconfig...`);

			const project: ProjectDefinition | undefined = getProject(options, workspace);

			if (!project) {
				context.logger.warn(`[WARNING]: Target project not found.`);
				return;
			}

			const buildTarget: TargetDefinition | undefined = project.targets.get('build');
			const serveTarget: TargetDefinition | undefined = project.targets.get('serve');

			if (buildTarget) {
				const tsConfigPath: string | undefined =
					buildTarget.options && (buildTarget.options['tsConfig'] as string);

				tsConfigPath && updateTsConfig(tree, String(tsConfigPath));
			} else {
				context.logger.warn(`[WARNING]: "build" target was not found.`);
			}

			if (serveTarget) {
				const tsConfigPath: string | undefined =
					serveTarget.options && (serveTarget.options['tsConfig'] as string);

				tsConfigPath && updateTsConfig(tree, String(tsConfigPath));
			} else {
				context.logger.warn(`[WARNING]: "serve" target was not found.`);
			}
		});
	};
}

/**
 *
 * @param tree
 * @param path
 * @param filePath
 * @param projectName
 */
function updateTsConfig(tree: Tree, filePath: string): void {
	const json: JSONFile = new JSONFile(tree, filePath);

	json.modify(['compilerOptions', 'allowSyntheticDefaultImports'], true);
}
