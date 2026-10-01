import { ProjectDefinition } from '@angular-devkit/core/src/workspace';

/** The builder of the Vite engine's production build. */
export const VITE_APPLICATION_BUILDER = '@ng-doc/builder:vite-application';

/**
 * The target the Vite setup keeps the Angular build options in, for the Angular builders that
 * read them (`unit-test`, `extract-i18n`). `@ng-doc/builder:vite-setup` creates it.
 */
export const ANGULAR_BUILD_TARGET = 'build-angular';

/** The target `migrate-to-vite` keeps the legacy build target in. */
export const LEGACY_BUILD_TARGET = 'build-legacy';

/**
 * The target that holds the application's Angular build options: `build`, or, once `build` runs
 * the Vite engine (whose options are a Vite configuration file), `build-angular` of `ng add` or
 * `build-legacy` of `migrate-to-vite`.
 * @param project - The application project.
 */
export function getBuildOptionsTarget(project: ProjectDefinition): string {
  if (project.targets.get('build')?.builder !== VITE_APPLICATION_BUILDER) {
    return 'build';
  }

  return (
    [ANGULAR_BUILD_TARGET, LEGACY_BUILD_TARGET].find((name: string) => project.targets.has(name)) ??
    'build'
  );
}
