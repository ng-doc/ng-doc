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

/** Options through which a builder runs another target, as `project:target[:configuration]`. */
const DELEGATING_OPTIONS: string[] = ['target', 'buildTarget', 'browserTarget'];

/** Angular's builders that take the application's build options. */
const ANGULAR_BUILD_BUILDERS: string[] = [
  '@angular/build:application',
  '@angular-devkit/build-angular:application',
  '@angular-devkit/build-angular:browser',
  '@angular-devkit/build-angular:browser-esbuild',
];

/**
 * The target that holds the application's Angular build options: `build`, or, once `build` runs
 * the Vite engine (whose options are a Vite configuration file), `build-angular` of `ng add` or
 * `build-legacy` of `migrate-to-vite`. A `build` builder that runs Angular's builder from another
 * target of the project, as native federation runs its `esbuild` target, has them on that target.
 * @param project - The application project.
 */
export function getBuildOptionsTarget(project: ProjectDefinition): string {
  const build = project.targets.get('build');

  if (build?.builder !== VITE_APPLICATION_BUILDER) {
    return delegatedBuildTarget(project) ?? 'build';
  }

  return (
    [ANGULAR_BUILD_TARGET, LEGACY_BUILD_TARGET].find((name: string) => project.targets.has(name)) ??
    'build'
  );
}

/**
 * The target of the project that `build` runs Angular's builder through, if it runs one. Native
 * federation names it in the configurations of `build`
 * (`"production": {"target": "app:esbuild:production"}`).
 * @param project - The application project.
 */
function delegatedBuildTarget(project: ProjectDefinition): string | undefined {
  const build = project.targets.get('build');
  const configurations = build?.configurations ?? {};
  const defaultConfiguration = build?.defaultConfiguration;
  const candidates = [
    build?.options,
    defaultConfiguration ? configurations[defaultConfiguration] : undefined,
    ...Object.values(configurations),
  ].flatMap((options) => DELEGATING_OPTIONS.map((option: string) => options?.[option]));

  for (const value of candidates) {
    const name: string | undefined = typeof value === 'string' ? value.split(':')[1] : undefined;
    const builder: string | undefined = name ? project.targets.get(name)?.builder : undefined;

    if (name && name !== 'build' && builder && ANGULAR_BUILD_BUILDERS.includes(builder)) {
      return name;
    }
  }

  return undefined;
}
