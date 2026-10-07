import { ProjectDefinition, WorkspaceDefinition } from '@angular-devkit/core/src/workspace';
import { Rule, SchematicContext, Tree } from '@angular-devkit/schematics';
import { getWorkspace } from '@schematics/angular/utility/workspace';
import { createProject, resetActiveProject, setActiveProject } from 'ng-morph';

import { APP_COMPONENT_CONTENT } from '../constants/app-component-content';
import { Schema } from '../schema';
import { getAppTemplatePath } from '../utils/get-app-template-path';
import { getBootstrapPath } from '../utils/get-main-path';
import { getProject } from '../utils/get-project';

/**
 * Replaces the root component's template with the NgDoc layout.
 * @param options - The `ng add` options.
 */
export function addLayout(options: Schema): Rule {
  return async (tree: Tree, context: SchematicContext) => {
    const logger = context.logger.createChild('add-layout');

    context.logger.info(`[INFO]: Application layout`);
    logger.info(`🔄 Replacing the content of the root component with NgDoc layout...`);

    try {
      const workspace: WorkspaceDefinition = await getWorkspace(tree);
      const project: ProjectDefinition | undefined = getProject(options, workspace);

      if (!project) {
        logger.error(
          `❌ Target project not found. Please replace the content of the root component with NgDoc layout manually.`,
        );

        return;
      }

      const mainPath: string | undefined = getBootstrapPath(tree, project);

      // A project of its own: the one of an earlier step may hold edits that step did not save.
      setActiveProject(createProject(tree, '/', ['**/*.ts', '**/*.json']));

      const appTemplatePath: string | undefined = getAppTemplatePath(tree, mainPath);

      if (!appTemplatePath || !mainPath) {
        logger.error(
          '❌ Could not find the default main template file for the project. Please replace the content of the root component with NgDoc layout manually.',
        );

        return;
      }

      const html: Buffer | null = tree.read(appTemplatePath);

      if (html) {
        tree.overwrite(appTemplatePath, APP_COMPONENT_CONTENT);

        logger.info('✅ Done!');
      }
    } catch (e) {
      logger.error(`❌ Error: ${e}`);
    } finally {
      resetActiveProject();
    }
  };
}
