import {getProjectTargetOptions} from '@angular/cdk/schematics';
import {JsonArray, JsonValue} from '@angular/compiler-cli/ngcc/src/utils';
import {Rule, SchematicContext, Tree} from '@angular-devkit/schematics';
import {ProjectDefinition, updateWorkspace, WorkspaceDefinition} from '@schematics/angular/utility/workspace';

import {NG_DOC_STYLES} from '../constants/styles';
import {Schema} from '../schema';
import {getProject} from '../utils/get-project';

/**
 *
 * @param options
 * @param context
 */
export function addStyles(options: Schema): Rule {
	return async (tree: Tree, context: SchematicContext) => {
		return updateWorkspace((workspace: WorkspaceDefinition) => {
			context.logger.info(`[INFO]: Adding global styles...`);

			const project: ProjectDefinition | undefined = getProject(options, workspace);

			if (!project) {
				context.logger.warn(`[WARNING]: Target project not found.`);
				return;
			}

			const targetOptions: Record<string, JsonValue> = getProjectTargetOptions(project, 'build');

			const styles: JsonArray | undefined = targetOptions['styles'] as JsonArray | undefined;

			if (!styles) {
				targetOptions['styles'] = NG_DOC_STYLES;
				return;
			}

			targetOptions['styles'] = Array.from(new Set([...NG_DOC_STYLES, ...styles]));
		});
	}
}
