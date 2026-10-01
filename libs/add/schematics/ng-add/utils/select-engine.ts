import { logging } from '@angular-devkit/core';
import { ProjectDefinition } from '@angular-devkit/core/src/workspace';
import { SchematicsException, Tree } from '@angular-devkit/schematics';
import { createProject, resetActiveProject, setActiveProject } from 'ng-morph';

import { NgDocEngine } from '../schema';
import { VITE_APPLICATION_BUILDER } from './get-build-options-target';
import { getMainPath } from './get-main-path';
import { getBootstrapModuleFn } from './get-root-module';

/** The command that moves a project from the legacy builders to the Vite engine. */
export const MIGRATE_TO_VITE = 'ng g @ng-doc/builder:migrate-to-vite';

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
}

/** Angular's application builders, whose options the Vite setup reads. */
export const ANGULAR_APPLICATION_BUILDERS: string[] = [
  '@angular/build:application',
  '@angular-devkit/build-angular:application',
];

const NG_DOC_BUILDER_PREFIX = '@ng-doc/builder:';

/**
 * Whether the application bootstraps an NgModule (`bootstrapModule`) instead of a standalone
 * component.
 * @param tree - The workspace tree.
 * @param project - The application project.
 */
export function isNgModuleApp(tree: Tree, project: ProjectDefinition): boolean {
  // Without a build target there is no entry to look at; the setup reports the missing target.
  const mainPath: string | undefined = project.targets.has('build')
    ? getMainPath(project)
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
 * standalone application gets the Vite engine unless `--engine legacy` is passed; an NgModule
 * application, or one whose `build` target does not use Angular's application builder, gets the
 * legacy builders; `--engine vite` is refused for an NgModule application.
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
  // builder (a browser builder, an Nx or custom executor) gets the legacy builders, as before; an
  // explicit `--engine vite` goes on to the Vite setup, which refuses it and says why.
  if (requested === undefined && !ANGULAR_APPLICATION_BUILDERS.includes(build ?? '')) {
    logger.info(
      `ℹ️ The "build" target uses ${build ? `"${build}"` : 'no builder'}, not Angular's application builder, so NgDoc uses the legacy builders.`,
    );

    return { engine: 'legacy', existing: false, replaceBuilders: true };
  }

  return { engine: requested ?? 'vite', existing: false, replaceBuilders: true };
}
