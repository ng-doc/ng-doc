import {getProjectTargetOptions} from '@angular/cdk/schematics';
import {JsonArray, JsonValue} from '@angular/compiler-cli/ngcc/src/utils';
import {Rule, SchematicContext, Tree} from '@angular-devkit/schematics';
import {ProjectDefinition, updateWorkspace, WorkspaceDefinition} from '@schematics/angular/utility/workspace';

import {Schema} from '../schema';
import {getProject} from '../utils/get-project';

/**
 *
 * @param options
 * @param context
 */
export function addJsDependencies(options: Schema): Rule {
	return async (tree: Tree, context: SchematicContext) => {
		return updateWorkspace((workspace: WorkspaceDefinition) => {
			context.logger.info(`[INFO]: Adding @ng-doc/core to allowedCommonJsDependencies...`);

			const project: ProjectDefinition | undefined = getProject(options, workspace);

			if (!project) {
				context.logger.warn(`[WARNING]: Target project not found.`);
				return;
			}

			const targetOptions: Record<string, JsonValue> = getProjectTargetOptions(project, 'build');

			const jsDependencies: JsonArray | undefined = targetOptions['allowedCommonJsDependencies'] as
				| JsonArray
				| undefined;

			if (!jsDependencies) {
				targetOptions['allowedCommonJsDependencies'] = ['@ng-doc/core'];
				return;
			}

			targetOptions['allowedCommonJsDependencies'] = Array.from(new Set([...jsDependencies, '@ng-doc/core']));
		});
	};
}
