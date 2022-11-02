import {JsonValue} from '@angular/compiler-cli/ngcc/src/utils';
import {Rule, SchematicContext} from '@angular-devkit/schematics';
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
 * @param context
 */
export function disableAot(options: Schema, context: SchematicContext): Rule {
	return updateWorkspace((workspace: WorkspaceDefinition) => {
		context.logger.info(`[INFO]: Disabling AOT to enable Playgrounds...`);

		const project: ProjectDefinition | undefined = getProject(options, workspace);

		if (!project) {
			context.logger.warn(`[WARNING]: Target project not found.`);
			return;
		}

		const buildTarget: TargetDefinition | undefined = project.targets.get('build');
		const serveTarget: TargetDefinition | undefined = project.targets.get('serve');

		if (buildTarget) {
			disableOptimizations(buildTarget)
		}

		if (serveTarget) {
			disableOptimizations(serveTarget)
		}
	});
}

/**
 *
 * @param definition
 */
function disableOptimizations(definition: TargetDefinition): void {
	if (definition.configurations) {
		Object.keys(definition.configurations)
			.forEach((key: string) => {
				const configuration:  Record<string, JsonValue> | undefined = definition.configurations && definition.configurations[key];

				if (configuration) {
					configuration["optimization"] = false;
					configuration["buildOptimizer"] = false;
					configuration["aot"] = false;
				}
			})
	}
}
