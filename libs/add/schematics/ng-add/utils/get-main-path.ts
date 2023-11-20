import { getProjectTargetOptions } from '@angular/cdk/schematics';
import { JsonValue } from '@angular-devkit/core';
import { ProjectDefinition } from '@angular-devkit/core/src/workspace';

/**
 *
 * @param project
 */
export function getMainPath(project: ProjectDefinition): string {
	const buildOptions: Record<string, JsonValue | undefined> = getProjectTargetOptions(
		project,
		'build',
	);

	return (buildOptions['main'] ?? buildOptions['browser']) as string;
}
