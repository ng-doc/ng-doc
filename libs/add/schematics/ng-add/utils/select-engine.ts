import { logging } from '@angular-devkit/core';
import { ProjectDefinition } from '@angular-devkit/core/src/workspace';
import { SchematicsException, Tree } from '@angular-devkit/schematics';
import { createProject, resetActiveProject, setActiveProject } from 'ng-morph';

import { NgDocEngine } from '../schema';
import { VITE_APPLICATION_BUILDER } from './get-build-options-target';
import { getBootstrapPath } from './get-main-path';
import { getBootstrapModuleFn } from './get-root-module';

/** The command that moves a project from the legacy builders to the Vite engine. */
export const MIGRATE_TO_VITE = 'ng g @ng-doc/builder:migrate-to-vite';

/** The recipe for a project whose builder NgDoc must not replace. */
export const KEEP_ANOTHER_BUILDER_URL =
  'https://ng-doc.com/docs/build-and-deploy/dev-server-and-builds#keep-another-builder';

/** The engine `ng add` sets up, and whether the project already had it. */
export interface EngineChoice {
  engine: NgDocEngine;
  /** The project already builds with NgDoc: its builders are kept as they are. */
  existing: boolean;
  /**
   * Whether the legacy setup sets its builders on `build` and `serve`. An existing project whose
   * NgDoc builder is on another target keeps `build` and `serve` as they are.
   */
  replaceBuilders: boolean;
  /**
   * The builder of `build` or `serve` that NgDoc doesn't replace (native federation, a custom
   * builder). No NgDoc builder is set up then: the project generates its documentation with the
   * `ng-doc` command next to that builder.
   */
  keptBuilder?: string;
}

/**
 * The application builders whose options the Vite setup reads: Angular's, and Nx's executor that
 * runs Angular's with the same options (the Vite setup reports the few options Nx adds).
 */
export const ANGULAR_APPLICATION_BUILDERS: string[] = [
  '@angular/build:application',
  '@angular-devkit/build-angular:application',
  '@nx/angular:application',
];

const NG_DOC_BUILDER_PREFIX = '@ng-doc/builder:';

/** Angular's builders, which the legacy builders replace. */
const ANGULAR_BUILDER_PREFIXES: string[] = ['@angular/build:', '@angular-devkit/build-angular:'];

/**
 * Nx's executors that run Angular's builders with the same options, so they are not foreign: the
 * Vite setup reads the options of `application`, and the legacy builders replace them as they
 * replace Angular's.
 */
const NX_ANGULAR_BUILDERS: string[] = [
  '@nx/angular:application',
  '@nx/angular:browser-esbuild',
  '@nx/angular:dev-server',
];

/**
 * Whether a builder is neither Angular's (or an Nx executor that runs it) nor NgDoc's: NgDoc doesn't
 * know what it does, so it doesn't replace it. Native federation, for example, runs Angular's
 * builder from another target and adds an import map to its output.
 * @param builder - The builder of a target.
 */
export function isForeignBuilder(builder: string): boolean {
  return (
    ![...ANGULAR_BUILDER_PREFIXES, NG_DOC_BUILDER_PREFIX].some((prefix: string) =>
      builder.startsWith(prefix),
    ) && !NX_ANGULAR_BUILDERS.includes(builder)
  );
}

/**
 * Whether the application bootstraps an NgModule (`bootstrapModule`) instead of a standalone
 * component.
 * @param tree - The workspace tree.
 * @param project - The application project.
 */
export function isNgModuleApp(tree: Tree, project: ProjectDefinition): boolean {
  // Without a build target there is no entry to look at; the setup reports the missing target.
  const mainPath: string | undefined = project.targets.has('build')
    ? getBootstrapPath(tree, project)
    : undefined;

  if (!mainPath || !tree.exists(mainPath)) {
    return false;
  }

  try {
    setActiveProject(createProject(tree, '/', [mainPath]));

    return !!getBootstrapModuleFn(mainPath);
  } finally {
    resetActiveProject();
  }
}

/**
 * Chooses the engine to set up. A project that already builds with NgDoc keeps its engine: `ng add`
 * never switches it (the legacy builders move to the Vite engine with `migrate-to-vite`). A new
 * standalone application on Angular's application builder (or Nx's executor that runs it) gets the
 * Vite engine unless `--engine legacy` is passed; an NgModule application, or one whose `build`
 * target uses another builder, gets the legacy builders; `--engine vite` is refused for an NgModule
 * application. Without `--engine`, a
 * `build` or `serve` builder that is neither Angular's nor NgDoc's is kept (`keptBuilder`).
 * @param tree - The workspace tree.
 * @param project - The application project.
 * @param requested - The `--engine` option, if any.
 * @param logger - Where the choice is explained.
 */
export function selectEngine(
  tree: Tree,
  project: ProjectDefinition,
  requested: NgDocEngine | undefined,
  logger: logging.LoggerApi,
): EngineChoice {
  const build: string | undefined = project.targets.get('build')?.builder;
  const serve: string | undefined = project.targets.get('serve')?.builder;

  if (build === VITE_APPLICATION_BUILDER) {
    if (requested === 'legacy') {
      logger.warn(
        `⚠️ The project already builds with the Vite engine (${VITE_APPLICATION_BUILDER}); "--engine legacy" was ignored and the builders were kept.`,
      );
    }

    return { engine: 'vite', existing: true, replaceBuilders: false };
  }

  // Any NgDoc builder, not only on `build` and `serve`, means the project already uses NgDoc.
  const ngDocTarget: [string, string] | undefined = [...project.targets.entries()]
    .map(([name, target]): [string, string] => [name, target.builder ?? ''])
    .find(([, builder]) => builder.startsWith(NG_DOC_BUILDER_PREFIX));

  if (ngDocTarget) {
    const message: string = `The project already uses the NgDoc builders ("${ngDocTarget[0]}" runs ${ngDocTarget[1]}); they were kept. To move it to the Vite engine, run "${MIGRATE_TO_VITE}".`;

    if (requested === 'vite') {
      logger.warn(`⚠️ "--engine vite" was ignored. ${message}`);
    } else {
      logger.info(`ℹ️ ${message}`);
    }

    return {
      engine: 'legacy',
      existing: true,
      replaceBuilders:
        !!build?.startsWith(NG_DOC_BUILDER_PREFIX) || !!serve?.startsWith(NG_DOC_BUILDER_PREFIX),
    };
  }

  // A builder NgDoc doesn't know is kept, unless `--engine` asks for NgDoc's builders. The
  // documentation is then generated with the `ng-doc` command next to it.
  const foreign: [string, string] | undefined = requested
    ? undefined
    : (
        [
          ['build', build],
          ['serve', serve],
        ] as Array<[string, string | undefined]>
      ).find((entry): entry is [string, string] => !!entry[1] && isForeignBuilder(entry[1]));

  if (foreign) {
    logger.info(
      `ℹ️ The "${foreign[0]}" target uses "${foreign[1]}", which NgDoc doesn't replace, so the "build" and "serve" builders were kept and no NgDoc builder was set up. Generate the documentation with the "ng-doc" command next to your builder: ${KEEP_ANOTHER_BUILDER_URL}`,
    );

    return { engine: 'legacy', existing: false, replaceBuilders: false, keptBuilder: foreign[1] };
  }

  if (isNgModuleApp(tree, project)) {
    if (requested === 'vite') {
      throw new SchematicsException(
        `[NGDOC_ADD_ENGINE] "ng add" sets up the Vite engine for standalone applications (bootstrapApplication), and this application bootstraps an NgModule. Run "ng add @ng-doc/add --engine legacy", then "${MIGRATE_TO_VITE}" if you want the Vite engine.`,
      );
    }

    if (requested === undefined) {
      logger.info(
        `ℹ️ The application bootstraps an NgModule, so NgDoc uses the legacy builders. "${MIGRATE_TO_VITE}" moves it to the Vite engine later.`,
      );
    }

    return { engine: 'legacy', existing: false, replaceBuilders: true };
  }

  // The Vite setup reads the options of Angular's application builder. Without `--engine`, another
  // builder (a browser builder, Nx's `browser-esbuild`) gets the legacy builders, as before; an
  // explicit `--engine vite` goes on to the Vite setup, which refuses it and says why.
  if (requested === undefined && !ANGULAR_APPLICATION_BUILDERS.includes(build ?? '')) {
    logger.info(
      `ℹ️ The "build" target uses ${build ? `"${build}"` : 'no builder'}, not Angular's application builder, so NgDoc uses the legacy builders.`,
    );

    return { engine: 'legacy', existing: false, replaceBuilders: true };
  }

  return { engine: requested ?? 'vite', existing: false, replaceBuilders: true };
}
