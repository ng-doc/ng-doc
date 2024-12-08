import { ProjectDefinition, WorkspaceDefinition } from '@angular-devkit/core/src/workspace';
import { Rule, SchematicContext, Tree } from '@angular-devkit/schematics';
import { getWorkspace } from '@schematics/angular/utility/workspace';
import {
  addImportToComponent,
  addImportToNgModule,
  addProviderToBootstrapApplicationFn,
  addProviderToNgModule,
  createProject,
  getBootstrapApplicationFn,
  getBootstrapFn,
  getMainModule,
  Identifier,
  Node,
  ObjectLiteralExpression,
  saveActiveProject,
  setActiveProject,
  SyntaxKind,
} from 'ng-morph';

import { EntityImport, ImportConstant, MODULE_APP, STANDALONE_APP } from '../constants/modules';
import { Schema } from '../schema';
import { addUniqueImport } from '../utils/add-unique-import';
import { getAppComponent } from '../utils/get-app-component';
import { getMainPath } from '../utils/get-main-path';
import { getProject } from '../utils/get-project';

/**
 *
 * @param options
 */
export function addNgDocAppConfig(options: Schema): Rule {
  return async (tree: Tree, context: SchematicContext) => {
    const logger = context.logger.createChild('add-ng-doc-app-config');

    context.logger.info(`[INFO]: NgDoc App configuration`);
    logger.info(`🔄 Integrating NgDoc to the project...`);

    try {
      const workspace: WorkspaceDefinition = await getWorkspace(tree);
      const project: ProjectDefinition | undefined = getProject(options, workspace);

      if (!project) {
        logger.error(`❌ Target project not found. Please configure your application manually.`);

        return;
      }

      const mainPath: string = getMainPath(project);

      setActiveProject(createProject(tree, '/', ['**/*.ts', '**/*.json']));

      const bootstrapApplicationFn = getBootstrapApplicationFn(mainPath);
      const bootstrapFn = getBootstrapFn(mainPath);

      if (bootstrapApplicationFn) {
        const appComponent = getAppComponent(tree, mainPath);

        if (!appComponent) {
          logger.error(
            `❌ Could not find the root component. Please configure your application manually.`,
          );

          return;
        }

        const [, options = bootstrapApplicationFn.addArgument(`{providers: []}`)] =
          bootstrapApplicationFn.getArguments();
        if (!Node.isIdentifier(options) && !Node.isObjectLiteralExpression(options)) {
          return;
        }
        const optionsObject = getOptionsObject(options);

        STANDALONE_APP.providers.forEach((provider: ImportConstant) => {
          addProviderToBootstrapApplicationFn(bootstrapApplicationFn, provider.initializer, {
            unique: true,
          });

          provider.imports.forEach((providerImport: EntityImport) => {
            addUniqueImport(
              optionsObject.getSourceFile().getFilePath(),
              providerImport.name,
              providerImport.path,
            );
          });
        });

        STANDALONE_APP.imports.forEach((component: ImportConstant) => {
          addImportToComponent(appComponent, component.initializer, { unique: true });

          component.imports.forEach((componentImport: EntityImport) => {
            addUniqueImport(
              appComponent.getSourceFile().getFilePath(),
              componentImport.name,
              componentImport.path,
            );
          });
        });
      } else if (bootstrapFn) {
        const mainModule = getMainModule(mainPath);

        if (!mainModule) {
          logger.error(
            `❌ Could not find the root module. Please configure your application manually.`,
          );

          return;
        }

        MODULE_APP.imports.forEach((module: ImportConstant) => {
          addImportToNgModule(mainModule, module.initializer, { unique: true });

          module.imports.forEach((mi: EntityImport) => {
            addUniqueImport(mainModule.getSourceFile().getFilePath(), mi.name, mi.path);
          });
        });

        MODULE_APP.providers.forEach((provider: ImportConstant) => {
          addProviderToNgModule(mainModule, provider.initializer, { unique: true });

          provider.imports.forEach((providerImport: EntityImport) => {
            addUniqueImport(
              mainModule.getSourceFile().getFilePath(),
              providerImport.name,
              providerImport.path,
            );
          });
        });
      } else {
        logger.error(
          `❌ Could not find the root module. Please configure your application manually.`,
        );

        return;
      }

      saveActiveProject();

      logger.info('✅ Done!');
    } catch (e) {
      logger.error(`❌ Error: ${e}`);
    }
  };
}

/**
 *
 * @param options
 */
function getOptionsObject(options: Identifier | ObjectLiteralExpression): ObjectLiteralExpression {
  if (Node.isObjectLiteralExpression(options)) {
    return options;
  }

  const definition = options.getDefinitionNodes()[0];

  return definition.getChildrenOfKind(SyntaxKind.ObjectLiteralExpression)[0];
}
