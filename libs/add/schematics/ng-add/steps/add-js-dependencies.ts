import { getProjectTargetOptions } from '@angular/cdk/schematics';
import { JsonArray, JsonValue } from '@angular-devkit/core';
import { Rule, SchematicContext, Tree } from '@angular-devkit/schematics';
import {
  ProjectDefinition,
  updateWorkspace,
  WorkspaceDefinition,
} from '@schematics/angular/utility/workspace';

import { Schema } from '../schema';
import { getProject } from '../utils/get-project';

/**
 *
 * @param options
 * @param context
 */
export function addJsDependencies(options: Schema): Rule {
  return async (tree: Tree, context: SchematicContext) => {
    return updateWorkspace((workspace: WorkspaceDefinition) => {
      const logger = context.logger.createChild('add-js-dependencies');

      context.logger.info(`[INFO]: Common JS dependencies`);
      logger.info(`🔄 Adding "@ng-doc/core" library to "allowedCommonJsDependencies"...`);

      try {
        const project: ProjectDefinition | undefined = getProject(options, workspace);

        if (!project) {
          logger.error(
            `❌ Target project not found. Please add "@ng-doc/core" library to "allowedCommonJsDependencies" manually.`,
          );

          return;
        }

        const targetOptions: Record<string, JsonValue | undefined> = getProjectTargetOptions(
          project,
          'build',
        );
        const jsDependencies: JsonArray | undefined = targetOptions[
          'allowedCommonJsDependencies'
        ] as JsonArray | undefined;

        targetOptions['allowedCommonJsDependencies'] = Array.from(
          new Set([...(jsDependencies ?? []), '@ng-doc/core']),
        );

        logger.info('✅ Done!');
      } catch (e) {
        logger.error(`❌ Error: ${e}`);
      }
    });
  };
}
