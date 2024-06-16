import { ProjectDefinition, WorkspaceDefinition } from '@angular-devkit/core/src/workspace';

import { Schema } from '../schema';
import { getProjectName } from './get-project-name';

/**
 *
 * @param options
 * @param workspace
 */
export function getProject(
  options: Schema,
  workspace: WorkspaceDefinition,
): ProjectDefinition | undefined {
  const projectName = getProjectName(options, workspace);

  return workspace.projects.get(projectName);
}
