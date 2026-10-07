import { getProjectTargetOptions } from '@angular/cdk/schematics';
import { JsonArray, JsonValue } from '@angular-devkit/core';
import { Rule, SchematicContext, Tree } from '@angular-devkit/schematics';
import {
  ProjectDefinition,
  updateWorkspace,
  WorkspaceDefinition,
} from '@schematics/angular/utility/workspace';

import { NG_DOC_STYLES } from '../constants/styles';
import { Schema } from '../schema';
import { getBuildOptionsTarget } from '../utils/get-build-options-target';
import { getProject } from '../utils/get-project';

/**
 *
 * @param options
 * @param context
 */
export function addStyles(options: Schema): Rule {
  return async (tree: Tree, context: SchematicContext) => {
    return updateWorkspace((workspace: WorkspaceDefinition) => {
      const logger = context.logger.createChild('add-styles');

      context.logger.info(`[INFO]: Global styles`);
      logger.info(`🔄 Adding NgDoc global styles to the target project...`);

      try {
        const project: ProjectDefinition | undefined = getProject(options, workspace);

        if (!project) {
          logger.error(`❌ Target project not found. Please add global NgDoc styles manually.`);

          return;
        }

        const targetOptions: Record<string, JsonValue | undefined> = getProjectTargetOptions(
          project,
          getBuildOptionsTarget(project),
        );
        const styles: JsonArray | undefined = targetOptions['styles'] as JsonArray | undefined;

        targetOptions['styles'] = Array.from(new Set([...NG_DOC_STYLES, ...(styles ?? [])]));

        logger.info('✅ Done!');
      } catch (e) {
        logger.error(`❌ Error: ${e}`);
      }
    });
  };
}
