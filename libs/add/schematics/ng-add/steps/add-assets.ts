import { getProjectTargetOptions } from '@angular/cdk/schematics';
import { JsonArray, JsonValue } from '@angular-devkit/core';
import { Rule, SchematicContext, Tree } from '@angular-devkit/schematics';
import {
  ProjectDefinition,
  updateWorkspace,
  WorkspaceDefinition,
} from '@schematics/angular/utility/workspace';

import { getNgDocAssets } from '../constants/assets';
import { Schema } from '../schema';
import { getProject } from '../utils/get-project';

/**
 * Adds the NgDoc assets to the build target. Entries that are already there are not added again.
 * @param options - The `ng add` options.
 */
export function addAssets(options: Schema): Rule {
  return async (tree: Tree, context: SchematicContext) => {
    return updateWorkspace((workspace: WorkspaceDefinition) => {
      const logger = context.logger.createChild('add-assets');

      context.logger.info(`[INFO]: Global assets`);
      logger.info(`🔄 Adding assets to the target project...`);

      try {
        const project: ProjectDefinition | undefined = getProject(options, workspace);

        if (!project) {
          logger.error(`❌ Target project not found. Please add assets manually.`);

          return;
        }

        const targetOptions: Record<string, JsonValue | undefined> = getProjectTargetOptions(
          project,
          'build',
        );

        const assets: JsonArray | undefined = targetOptions['assets'] as JsonArray | undefined;

        // Asset entries are objects, so they are compared by content: a second `ng add` run must
        // not add them again.
        const existing: Set<string> = new Set(
          (assets ?? []).map((asset: JsonValue) => JSON.stringify(asset)),
        );

        targetOptions['assets'] = [
          ...getNgDocAssets(options, workspace).filter(
            (asset: JsonValue) => !existing.has(JSON.stringify(asset)),
          ),
          ...(assets ?? []),
        ];

        logger.info('✅ Done!');
      } catch (e) {
        logger.error(`Error: ${e}`);
      }
    });
  };
}
