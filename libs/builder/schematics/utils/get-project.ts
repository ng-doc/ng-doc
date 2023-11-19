import { ProjectDefinition, WorkspaceDefinition } from '@angular-devkit/core/src/workspace';

/**
 *
 * @param workspace
 */
export function getProject(workspace: WorkspaceDefinition): ProjectDefinition | undefined {
	const ngDocProject: string | undefined = Array.from(workspace.projects.entries()).find(
		([, project]: [string, ProjectDefinition]) =>
			project.targets.get('build')?.builder.startsWith('@ng-doc/builder'),
	)?.[0];

	return ngDocProject ? workspace.projects.get(ngDocProject) : undefined;
}
