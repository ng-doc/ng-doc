import {Rule, SchematicContext, Tree} from '@angular-devkit/schematics';
import {
	ProjectDefinition,
	TargetDefinition,
	updateWorkspace,
	WorkspaceDefinition,
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
	return async (tree: Tree, context: SchematicContext) => {
		return updateWorkspace((workspace: WorkspaceDefinition) => {
			const logger = context.logger.createChild('add-tsconfig-paths');

			context.logger.info(`[INFO]: TSConfig paths`);
			logger.info(`🔄 Configuring TSConfig paths to allow import from ".ng-doc" folder...`);

			try {
				const project: ProjectDefinition | undefined = getProject(options, workspace);

				if (!project) {
					logger.error(`❌ Target project not found. Please configure tsconfig paths manually.`);

					return;
				}

				const buildTarget: TargetDefinition | undefined = project.targets.get('build');
				const serveTarget: TargetDefinition | undefined = project.targets.get('serve');

				if (buildTarget) {
					const tsConfigPath: string | undefined =
						buildTarget.options && (buildTarget.options['tsConfig'] as string);

					tsConfigPath && updateTsConfigPaths(tree, String(tsConfigPath), options.project);
				}

				if (serveTarget) {
					const tsConfigPath: string | undefined =
						serveTarget.options && (serveTarget.options['tsConfig'] as string);

					tsConfigPath && updateTsConfigPaths(tree, String(tsConfigPath), options.project);
				}

				logger.info('✅ Done!');
			} catch (e) {
				logger.error(`❌ Error: ${e}`);
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
function updateTsConfigPaths(tree: Tree, filePath: string, projectName: string): void {
	const json: JSONFile = new JSONFile(tree, filePath);

	const paths: string | undefined = json.get(['compilerOptions', 'paths']);
	const ext: string | undefined = json.get(['extends']);

	if (paths || !ext) {
		json.modify(
			['compilerOptions', 'paths', `${GENERATED_PATH}`],
			[`.ng-doc/${projectName}/index.ts`],
		);
		json.modify(['compilerOptions', 'paths', `${GENERATED_PATH}/*`], [`.ng-doc/${projectName}/*`]);
	} else if (ext) {
		updateTsConfigPaths(tree, path.join(path.dirname(filePath), ext), projectName);
	}
}
