import {getProjectTargetOptions} from '@angular/cdk/schematics';
import {JsonArray, JsonValue} from '@angular/compiler-cli/ngcc/src/utils';
import {Rule, SchematicContext, Tree} from '@angular-devkit/schematics';
import {ProjectDefinition, updateWorkspace, WorkspaceDefinition} from '@schematics/angular/utility/workspace';

import {NG_DOC_ASSETS} from '../constants/assets';
import {Schema} from '../schema';
import {getProject} from '../utils/get-project';

/**
 *
 * @param options
 * @param context
 */
export function addAssets(options: Schema): Rule {
	return async (tree: Tree, context: SchematicContext) => {
		return updateWorkspace((workspace: WorkspaceDefinition) => {
			context.logger.info(`[INFO]: Adding global assets...`);

			const project: ProjectDefinition | undefined = getProject(options, workspace);

			if (!project) {
				context.logger.warn(`[WARNING]: Target project not found.`);
				return;
			}

			const targetOptions: Record<string, JsonValue> = getProjectTargetOptions(project, 'build');

			const assets: JsonArray | undefined = targetOptions['assets'] as JsonArray | undefined;
			const jsDependencies: JsonArray | undefined = targetOptions['allowedCommonJsDependencies'] as JsonArray | undefined;

			if (!assets) {
				targetOptions['assets'] = NG_DOC_ASSETS;
				return;
			}

			if (!jsDependencies) {
				targetOptions['allowedCommonJsDependencies'] = ['@ng-doc/core'];
				return;
			}

			targetOptions['assets'] = Array.from(new Set([...NG_DOC_ASSETS, ...assets]));
			targetOptions['allowedCommonJsDependencies'] = Array.from(new Set([...jsDependencies, '@ng-doc/core']));
		});
	}
}
