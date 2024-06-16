import { ProjectDefinition, WorkspaceDefinition } from '@angular-devkit/core/src/workspace';

import { Schema } from '../schema';

/**
 *
 * @param options
 * @param workspace
 */
export function getProjectName(options: Schema, workspace: WorkspaceDefinition): string {
  const firstBuildableProjectName: string | undefined = Array.from(
    workspace.projects.entries(),
  ).find(([, project]: [string, ProjectDefinition]) => project.targets.get('build'))?.[0];

  return (
    options.project ||
    workspace.extensions['defaultProject']?.toString() ||
    firstBuildableProjectName ||
    ''
  );
}
