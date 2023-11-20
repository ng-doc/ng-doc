import { Tree } from '@angular-devkit/schematics';
import {
	ProjectDefinition,
	TargetDefinition,
	updateWorkspace,
	WorkspaceDefinition,
} from '@schematics/angular/utility/workspace';
import { JSONFile } from 'ng-morph';

import { getProject, getProjectName, modifyTsConfigs } from '../../utils';

/**
 *
 */
export function updateTsConfig() {
	return async (tree: Tree) => {
		return updateWorkspace((workspace: WorkspaceDefinition) => {
			const projectName: string | undefined = getProjectName(workspace);
			const project: ProjectDefinition | undefined = getProject(workspace);

			if (!project) {
				return;
			}

			const buildTarget: TargetDefinition | undefined = project.targets.get('build');
			const serveTarget: TargetDefinition | undefined = project.targets.get('serve');
			const modifier = (json: JSONFile) => {
				const paths: string | undefined = json.get(['compilerOptions', 'paths']);

				if (paths) {
					json.modify(
						['compilerOptions', 'paths', `@ng-doc/generated`],
						[`ng-doc/${projectName}/index.ts`],
					);
				}
			};

			if (buildTarget) {
				const tsConfigPath: string | undefined =
					buildTarget.options && (buildTarget.options['tsConfig'] as string);

				tsConfigPath && modifyTsConfigs(tree, String(tsConfigPath), modifier);
			}

			if (serveTarget) {
				const tsConfigPath: string | undefined =
					serveTarget.options && (serveTarget.options['tsConfig'] as string);

				tsConfigPath && modifyTsConfigs(tree, String(tsConfigPath), modifier);
			}
		});
	};
}
