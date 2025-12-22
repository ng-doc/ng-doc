import { ProjectDefinition, WorkspaceDefinition } from '@schematics/angular/utility';

/**
 *
 * @param workspace
 */
export function getProjectName(workspace: WorkspaceDefinition): string | undefined {
  const ngDocProject: string | undefined = Array.from(workspace.projects.entries()).find(
    ([, project]: [string, ProjectDefinition]) =>
      project.targets.get('build')?.builder.startsWith('@ng-doc/builder'),
  )?.[0];

  return ngDocProject;
}

/**
 *
 * @param workspace
 */
export function getProject(workspace: WorkspaceDefinition): ProjectDefinition | undefined {
  const ngDocProject: string | undefined = getProjectName(workspace);

  return ngDocProject ? workspace.projects.get(ngDocProject) : undefined;
}
