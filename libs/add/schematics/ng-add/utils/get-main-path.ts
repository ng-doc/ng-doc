import { getProjectTargetOptions } from '@angular/cdk/schematics';
import { JsonValue } from '@angular-devkit/core';
import { ProjectDefinition } from '@angular-devkit/core/src/workspace';
import { Tree } from '@angular-devkit/schematics';
import { posix } from 'path';

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

/** A call that starts the application. */
const BOOTSTRAP_CALL = /\bbootstrapApplication\s*\(|\.bootstrapModule\s*\(/;

/** A dynamic import of a relative module. */
const RELATIVE_DYNAMIC_IMPORT = /\bimport\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;

/**
 * Returns the file that starts the application: the browser entry, or, when the entry starts
 * nothing itself, the module it imports dynamically that does. The entry of a native federation
 * application loads the federation manifest first, then imports `./bootstrap`, which calls
 * `bootstrapApplication`.
 * @param tree - The workspace tree.
 * @param project - The application project.
 */
export function getBootstrapPath(tree: Tree, project: ProjectDefinition): string {
  const mainPath: string = getMainPath(project);
  const main: string | undefined = mainPath ? tree.read(mainPath)?.toString('utf-8') : undefined;

  if (main === undefined || BOOTSTRAP_CALL.test(main)) {
    return mainPath;
  }

  for (const [, specifier] of main.matchAll(RELATIVE_DYNAMIC_IMPORT)) {
    const base: string = posix.join(posix.dirname(mainPath), specifier);
    const found: string | undefined = [base, `${base}.ts`, `${base}/index.ts`].find(
      (path: string) =>
        /\.ts$/.test(path) &&
        tree.exists(path) &&
        BOOTSTRAP_CALL.test(tree.read(path)?.toString('utf-8') ?? ''),
    );

    if (found) {
      return found;
    }
  }

  return mainPath;
}
