import { Rule, SchematicContext, Tree } from '@angular-devkit/schematics';
import {
  ProjectDefinition,
  TargetDefinition,
  updateWorkspace,
  WorkspaceDefinition,
} from '@schematics/angular/utility/workspace';
import { JSONFile } from 'ng-morph';

import { Schema } from '../schema';
import { getProject } from '../utils/get-project';

/**
 *
 * @param options
 */
export function updateAppTsConfig(options: Schema): Rule {
  return async (tree: Tree, context: SchematicContext) => {
    return updateWorkspace((workspace: WorkspaceDefinition) => {
      const logger = context.logger.createChild('update-app-ts-config');

      context.logger.info(`[INFO]: TSConfig compilerOptions`);
      logger.info(`🔄 Updating tsconfig compilerOptions...`);

      try {
        const project: ProjectDefinition | undefined = getProject(options, workspace);

        if (!project) {
          logger.error(`❌ Target project not found. Please configure "compilerOptions" manually.`);

          return;
        }

        const buildTarget: TargetDefinition | undefined = project.targets.get('build');
        const serveTarget: TargetDefinition | undefined = project.targets.get('serve');

        if (buildTarget) {
          const tsConfigPath: string | undefined =
            buildTarget.options && (buildTarget.options['tsConfig'] as string);

          tsConfigPath && updateTsConfig(tree, String(tsConfigPath));
        }

        if (serveTarget) {
          const tsConfigPath: string | undefined =
            serveTarget.options && (serveTarget.options['tsConfig'] as string);

          tsConfigPath && updateTsConfig(tree, String(tsConfigPath));
        }

        logger.info('✅ Done!');
      } catch (e) {
        logger.error(`❌ Error: ${e}`);
      }
    });
  };
}

/**
 *
 * @param tree
 * @param path
 * @param filePath
 * @param projectName
 */
function updateTsConfig(tree: Tree, filePath: string): void {
  const json: JSONFile = new JSONFile(tree, filePath);

  json.modify(['compilerOptions', 'allowSyntheticDefaultImports'], true);
}
