import {ProjectDefinition, WorkspaceDefinition} from '@angular-devkit/core/src/workspace';

import {Schema} from '../schema';

/**
 *
 * @param options
 * @param workspace
 */
export function getProject(options: Schema, workspace: WorkspaceDefinition): ProjectDefinition | undefined {
	const firstBuildableProjectName: string | undefined = Array.from(workspace.projects.entries()).find(
		([, project]: [string, ProjectDefinition]) => project.targets.get('build'),
	)?.[0];

	const projectName: string =
		options.project || workspace.extensions['defaultProject']?.toString() || firstBuildableProjectName || '';
	return workspace.projects.get(projectName);
}
