import { ProjectDefinition, WorkspaceDefinition } from '@angular-devkit/core/src/workspace';
import { Rule, SchematicContext, Tree } from '@angular-devkit/schematics';
import { getWorkspace } from '@schematics/angular/utility/workspace';
import { createProject, resetActiveProject, setActiveProject } from 'ng-morph';

import { APP_COMPONENT_CONTENT } from '../constants/app-component-content';
import { Schema } from '../schema';
import { getBootstrapPath } from '../utils/get-main-path';
import { getProject } from '../utils/get-project';
import { getLayoutTemplate, LayoutTemplate } from '../utils/layout-template';

/** The guide for documentation under a route of an existing application. */
const LAZY_ROUTE_GUIDE: string = 'https://ng-doc.com/docs/customize/lazy-route';

/**
 * Puts the NgDoc layout in the root component's template when that template is Angular's
 * `ng new` placeholder, empty or only a router outlet. A template that the application wrote,
 * and an inline one, is never overwritten: the output says how to add the layout by hand.
 * @param options - The `ng add` options.
 */
export function addLayout(options: Schema): Rule {
  return async (tree: Tree, context: SchematicContext) => {
    const logger = context.logger.createChild('add-layout');

    context.logger.info(`[INFO]: Application layout`);

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

      const template: LayoutTemplate = getLayoutTemplate(tree, mainPath);

      switch (template.action) {
        case 'replace':
          logger.info(
            `🔄 Replacing the placeholder template of the root component with NgDoc layout...`,
          );
          tree.overwrite(template.path, APP_COMPONENT_CONTENT);
          logger.info('✅ Done!');
          break;
        case 'has-layout':
          logger.info('✅ The root component already renders the NgDoc layout.');
          break;
        case 'keep':
          logger.warn(
            [
              `⚠️ The root component's template belongs to your application, so it was left as it is.`,
              `Render the NgDoc layout where the documentation should be: in the root template, or in the component of a lazy documentation route (${LAZY_ROUTE_GUIDE}):`,
              APP_COMPONENT_CONTENT,
            ].join('\n'),
          );
          break;
        default:
          logger.error(
            '❌ Could not find the default main template file for the project. Please replace the content of the root component with NgDoc layout manually.',
          );
      }
    } catch (e) {
      logger.error(`❌ Error: ${e}`);
    } finally {
      resetActiveProject();
    }
  };
}
