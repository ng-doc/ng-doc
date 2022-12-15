import {Rule, SchematicContext, Tree} from '@angular-devkit/schematics';
import {
	ProjectDefinition,
	TargetDefinition,
	updateWorkspace,
	WorkspaceDefinition
} from '@schematics/angular/utility/workspace';
import {JSONFile} from 'ng-morph';
import * as path from 'path';

import {GENERATED_PATH} from '../constants/modules';
import {Schema} from '../schema';
import {getProject} from '../utils/get-project';

/**
 *
 * @param options
 */
export function addTsconfigPaths(options: Schema): Rule {
	return  async (tree: Tree, context: SchematicContext) => {
		return updateWorkspace((workspace: WorkspaceDefinition) => {
			context.logger.info(`[INFO]: Adding tsconfig paths to ng-doc folder...`);

			const project: ProjectDefinition | undefined = getProject(options, workspace);

			if (!project) {
				context.logger.warn(`[WARNING]: Target project not found.`);
				return;
			}

			const buildTarget: TargetDefinition | undefined = project.targets.get('build');
			const serveTarget: TargetDefinition | undefined = project.targets.get('serve');

			if (buildTarget) {
				const tsConfigPath: string = String(buildTarget.options && buildTarget.options['tsConfig']);

				updateTsConfigPaths(tree, tsConfigPath, options.project);
			} else {
				context.logger.warn(`[WARNING]: "build" target was not found, please add paths to ".ng-doc" folder in your tsconfig.json file manually.`);
			}

			if (serveTarget) {
				const tsConfigPath: string = String(serveTarget.options && serveTarget.options['tsConfig']);

				updateTsConfigPaths(tree, tsConfigPath, options.project);
			} else {
				context.logger.warn(`[WARNING]: "serve" target was not found, please add paths to ".ng-doc" folder in your tsconfig.json file manually.`);
			}
		});
	}
}

/**
 *
 * @param tree
 * @param path
 * @param filePath
 * @param projectName
 */
function updateTsConfigPaths(tree: Tree, filePath: string, projectName: string): void {
	const json: JSONFile = new JSONFile(tree, filePath);

	const paths: string | undefined = json.get(['compilerOptions', 'paths']);
	const ext: string | undefined = json.get(['extends']);

	if (paths || !ext) {
		json.modify(['compilerOptions', 'paths', `${GENERATED_PATH}`], `.ng-doc/${projectName}/index.ts`);
		json.modify(['compilerOptions', 'paths', `${GENERATED_PATH}/*`], `.ng-doc/${projectName}/*`);
	} else if (ext) {
		updateTsConfigPaths(tree, path.join(path.dirname(filePath), ext), projectName);
	}
}
