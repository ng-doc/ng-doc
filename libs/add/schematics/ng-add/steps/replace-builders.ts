import { Rule, SchematicContext, Tree } from '@angular-devkit/schematics';
import {
  ProjectDefinition,
  TargetDefinition,
  updateWorkspace,
  WorkspaceDefinition,
} from '@schematics/angular/utility/workspace';

import { Schema } from '../schema';
import { getProject } from '../utils/get-project';

const NG_DOC_BUILDER_PREFIX = '@ng-doc/builder:';

/**
 * Sets the legacy NgDoc builders on the build and serve targets.
 * @param options - The `ng add` options.
 */
export function replaceBuilders(options: Schema): Rule {
  return async (tree: Tree, context: SchematicContext) => {
    return updateWorkspace((workspace: WorkspaceDefinition) => {
      const logger = context.logger.createChild('replace-builders');

      context.logger.info(`[INFO]: Builders`);
      logger.info(`🔄 Replacing Angular CLI builders with @ng-doc builders...`);

      try {
        const project: ProjectDefinition | undefined = getProject(options, workspace);

        if (!project) {
          logger.error(`❌ Target project not found. Please replace builders manually.`);

          return;
        }

        const buildTarget: TargetDefinition | undefined = project.targets.get('build');
        const serveTarget: TargetDefinition | undefined = project.targets.get('serve');

        // A target that already runs an NgDoc builder (for example `modern-application`) keeps it.
        if (buildTarget && !(buildTarget.builder ?? '').startsWith(NG_DOC_BUILDER_PREFIX)) {
          buildTarget.builder = '@ng-doc/builder:application';
        } else if (buildTarget) {
          logger.info(`ℹ️ "build" already uses "${buildTarget.builder}".`);
        } else {
          logger.error(
            `❌ "build" target was not found, please add "@ng-doc/builder:application" builder manually.`,
          );
        }

        if (serveTarget && !(serveTarget.builder ?? '').startsWith(NG_DOC_BUILDER_PREFIX)) {
          serveTarget.builder = '@ng-doc/builder:dev-server';
        } else if (serveTarget) {
          logger.info(`ℹ️ "serve" already uses "${serveTarget.builder}".`);
        } else {
          logger.warn(
            `❌ "serve" target was not found, please add "@ng-doc/builder:dev-server" builder manually.`,
          );
        }

        logger.info('✅ Done!');
      } catch (e) {
        logger.error(`❌ Error: ${e}`);
      }
    });
  };
}
