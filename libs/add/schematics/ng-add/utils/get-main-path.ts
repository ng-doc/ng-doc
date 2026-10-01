import { getProjectTargetOptions } from '@angular/cdk/schematics';
import { JsonValue } from '@angular-devkit/core';
import { ProjectDefinition } from '@angular-devkit/core/src/workspace';

import { getBuildOptionsTarget } from './get-build-options-target';

/**
 * Returns the browser entry of the application (`browser`, or `main` of older builders).
 * @param project - The application project.
 */
export function getMainPath(project: ProjectDefinition): string {
  const buildOptions: Record<string, JsonValue | undefined> = getProjectTargetOptions(
    project,
    getBuildOptionsTarget(project),
  );

  return (buildOptions['main'] ?? buildOptions['browser']) as string;
}
