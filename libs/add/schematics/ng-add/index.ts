import { WorkspaceDefinition } from '@angular-devkit/core/src/workspace';
import {
  chain,
  externalSchematic,
  noop,
  Rule,
  SchematicContext,
  SchematicsException,
  Tree,
} from '@angular-devkit/schematics';
import { NodePackageInstallTask, RunSchematicTask } from '@angular-devkit/schematics/tasks';
import { getWorkspace } from '@schematics/angular/utility/workspace';
import {
  addPackageJsonDependency,
  createProject,
  removePackageJsonDependency,
  setActiveProject,
} from 'ng-morph';

import { NG_DOC_VERSION } from './constants/version';
import { Schema } from './schema';
import { addAssets } from './steps/add-assets';
import { addGitIgnore } from './steps/add-git-ignore';
import { addJsDependencies } from './steps/add-js-dependencies';
import { addLayout } from './steps/add-layout';
import { addNgDocAppConfig } from './steps/add-ng-doc-app-config';
import { addStyles } from './steps/add-styles';
import { addTsconfigPaths } from './steps/add-tsconfig-paths';
import { postInstall } from './steps/post-install';
import { raiseInitialBudget } from './steps/raise-initial-budget';
import { replaceBuilders } from './steps/replace-builders';
import { updateAppTsConfig } from './steps/update-app-ts-config';
import { getProject } from './utils/get-project';
import { getProjectName } from './utils/get-project-name';
import { EngineChoice, selectEngine } from './utils/select-engine';

/**
 *
 * @param options
 */
export function ngAdd(options: Schema): Rule {
  return (tree: Tree, context: SchematicContext) => {
    setActiveProject(createProject(tree, '/', ['**/*.ts', '**/*.json']));

    addPackageJsonDependency(tree, { name: `@ng-doc/app`, version: NG_DOC_VERSION });
    addPackageJsonDependency(tree, { name: `@ng-doc/builder`, version: NG_DOC_VERSION });
    addPackageJsonDependency(tree, { name: `@ng-doc/ui-kit`, version: NG_DOC_VERSION });
    addPackageJsonDependency(tree, { name: `@ng-doc/core`, version: NG_DOC_VERSION });
    removePackageJsonDependency(tree, '@ng-doc/add');

    context.addTask(new NodePackageInstallTask(), [
      context.addTask(new RunSchematicTask('ng-add-setup-project', options)),
    ]);
  };
}

/**
 * Sets up the project. It runs as a task before the install task of `ngAdd`, while `@ng-doc/add` is
 * still installed. The styles, assets and providers are the same for both engines. The Vite engine then reads the build target, as it now is, into
 * `vite.config.mjs` and the Vite targets (`@ng-doc/builder:vite-setup`); the legacy engine swaps
 * the builders of the build and serve targets.
 * @param options - The `ng add` options.
 */
export function ngAddSetupProject(options: Schema): Rule {
  return async (tree: Tree, context: SchematicContext) => {
    const workspace: WorkspaceDefinition = await getWorkspace(tree);
    const project = getProject(options, workspace);

    if (!project) {
      throw new SchematicsException(
        `[NGDOC_ADD_PROJECT] Project "${getProjectName(options, workspace)}" was not found. Pass --project.`,
      );
    }

    const choice: EngineChoice = selectEngine(tree, project, options.engine, context.logger);
    // The Vite targets hold no Angular build options: a second run must not add any to them.
    const editBuildTarget: boolean = !(choice.engine === 'vite' && choice.existing);

    context.logger.info(
      `[INFO]: Engine: ${choice.engine === 'vite' ? 'Vite (@ng-doc/builder:vite-application)' : 'legacy (@ng-doc/builder:application)'}`,
    );

    return chain([
      choice.engine === 'legacy' && choice.replaceBuilders ? replaceBuilders(options) : noop(),
      // Only a project new to NgDoc: an existing one chose its budgets.
      choice.engine === 'legacy' && !choice.existing ? raiseInitialBudget(options) : noop(),
      editBuildTarget ? addStyles(options) : noop(),
      editBuildTarget ? addAssets(options) : noop(),
      editBuildTarget ? addJsDependencies(options) : noop(),
      addNgDocAppConfig(options),
      addLayout(options),
      addTsconfigPaths(options),
      updateAppTsConfig(options),
      addGitIgnore(),
      // `@ng-doc/add` depends on `@ng-doc/builder`, so the schematic is there before the install
      // that follows this one. That install also installs the Vite dependencies it adds.
      choice.engine === 'vite'
        ? externalSchematic('@ng-doc/builder', 'vite-setup', {
            project: getProjectName(options, workspace),
            skipInstall: true,
          })
        : noop(),
      postInstall(choice.engine),
    ]);
  };
}
