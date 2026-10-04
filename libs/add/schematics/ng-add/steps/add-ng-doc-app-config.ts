import { logging } from '@angular-devkit/core';
import { ProjectDefinition, WorkspaceDefinition } from '@angular-devkit/core/src/workspace';
import { Rule, SchematicContext, Tree } from '@angular-devkit/schematics';
import { getWorkspace } from '@schematics/angular/utility/workspace';
import {
  addImportToComponent,
  ArrayLiteralExpression,
  CallExpression,
  ClassDeclaration,
  createProject,
  Expression,
  getBootstrapApplicationFn,
  Identifier,
  IndentationText,
  Node,
  ObjectLiteralExpression,
  resetActiveProject,
  saveActiveProject,
  setActiveProject,
  SourceFile,
  SyntaxKind,
} from 'ng-morph';

import { EntityImport, ImportConstant, MODULE_APP, STANDALONE_APP } from '../constants/modules';
import { Schema } from '../schema';
import {
  addArrayEntries,
  ArrayEntryResult,
  extendCall,
  findArrayEntries,
  getArrayProperty,
  getEntryName,
  isEntry,
} from '../utils/add-array-entry';
import { addUniqueImport } from '../utils/add-unique-import';
import { getAppComponent } from '../utils/get-app-component';
import { getInitializer } from '../utils/get-initializer';
import { getBootstrapPath } from '../utils/get-main-path';
import { getProject } from '../utils/get-project';
import { getBootstrapModuleFn, getRootModule } from '../utils/get-root-module';

/**
 * Adds the NgDoc providers, the router and the layout components to the application.
 *
 * Calls that the application already has (`provideRouter`, `provideHttpClient`,
 * `RouterModule.forRoot`) are extended rather than repeated, so the rule can run more than once.
 * It adds no change-detection provider: the application keeps running with or without zone.js.
 * @param options - The `ng add` options.
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

      const mainPath: string = getBootstrapPath(tree, project);
      const morphProject = createProject(tree, '/', ['**/*.ts', '**/*.json']);

      // Angular CLI projects indent with two spaces; ts-morph defaults to four.
      morphProject.manipulationSettings.set({ indentationText: IndentationText.TwoSpaces });
      setActiveProject(morphProject);

      const edits: ArrayEdit[] | undefined = planEdits(tree, mainPath, logger);

      if (!edits) {
        return;
      }

      // Imports go first: if one of them cannot be added, no array has been edited yet, and the
      // edits made so far are dropped with the project (nothing is saved).
      edits.forEach(({ file, entries }: ArrayEdit) =>
        entries.forEach((entry: ImportConstant) =>
          addEntryImports(file.getFilePath(), entry.imports),
        ),
      );
      edits.forEach(({ entries, apply }: ArrayEdit) => {
        const results: ArrayEntryResult[] = apply();

        entries.forEach((entry: ImportConstant, index: number) => {
          if (results[index] === 'extended') {
            logger.info(`🔄 Extended the existing "${getEntryName(entry)}" call.`);
          }
        });
      });

      saveActiveProject();

      logger.info('✅ Done!');
    } catch (e) {
      logger.error(
        `❌ Error: ${e}. This step changed no source file; please configure your application manually.`,
      );
    } finally {
      // Unsaved edits must not reach the tree through a later step that saves the active project.
      resetActiveProject();
    }
  };
}

/** Entries to add to one place of the application. */
interface ArrayEdit {
  /** The file that receives the named imports of the entries. */
  file: SourceFile;
  entries: ImportConstant[];
  /** Adds the entries and says what happened to each. */
  apply: () => ArrayEntryResult[];
}

/**
 * An edit that adds entries to an array literal.
 * @param array - The array.
 * @param entries - The entries.
 * @param logger - Receives what was merged and what needs a manual change.
 */
function arrayEdit(
  array: ArrayLiteralExpression,
  entries: ImportConstant[],
  logger: logging.LoggerApi,
): ArrayEdit {
  return {
    file: array.getSourceFile(),
    entries,
    apply: () => addArrayEntries(array, entries, logger),
  };
}

/**
 * Finds the arrays that the NgDoc entries go into, without adding anything yet.
 * @param tree - The workspace tree.
 * @param mainPath - Path of the application's main file.
 * @param logger - Receives what could not be found.
 * @returns The edits, or `undefined` when the application cannot be configured.
 */
function planEdits(
  tree: Tree,
  mainPath: string,
  logger: logging.LoggerApi,
): ArrayEdit[] | undefined {
  const bootstrapApplicationFn = getBootstrapApplicationFn(mainPath);

  if (bootstrapApplicationFn) {
    const appComponent = getAppComponent(tree, mainPath);

    if (!appComponent) {
      logger.error(
        `❌ Could not find the root component. Please configure your application manually.`,
      );

      return undefined;
    }

    const [, options = bootstrapApplicationFn.addArgument(`{providers: []}`)] =
      bootstrapApplicationFn.getArguments();
    const optionsObject: ObjectLiteralExpression | undefined =
      Node.isIdentifier(options) || Node.isObjectLiteralExpression(options)
        ? getOptionsObject(options)
        : undefined;
    const providers: ArrayLiteralExpression | undefined =
      optionsObject && getArrayProperty(optionsObject, 'providers');

    if (!providers) {
      logger.error(
        `❌ The "providers" of the application config are not an array literal. Please add NgDoc providers manually.`,
      );

      return undefined;
    }

    return [
      arrayEdit(providers, STANDALONE_APP.providers, logger),
      {
        file: appComponent.getSourceFile(),
        entries: STANDALONE_APP.imports,
        apply: () =>
          STANDALONE_APP.imports.map((component: ImportConstant) => {
            addImportToComponent(appComponent, component.initializer, { unique: true });

            return 'unchanged';
          }),
      },
    ];
  }

  if (!getBootstrapModuleFn(mainPath)) {
    logger.error(
      `❌ Could not find the "bootstrapApplication" or "bootstrapModule" call in "${mainPath}". Please configure your application manually.`,
    );

    return undefined;
  }

  const mainModule: ClassDeclaration | undefined = getRootModule(mainPath);
  const metadata: ObjectLiteralExpression | undefined =
    mainModule && getNgModuleMetadata(mainModule);

  if (!mainModule || !metadata) {
    logger.error(`❌ Could not find the root module. Please configure your application manually.`);

    return undefined;
  }

  const imports: ArrayLiteralExpression | undefined = getArrayProperty(metadata, 'imports');
  const providers: ArrayLiteralExpression | undefined = getArrayProperty(metadata, 'providers');

  if (!imports || !providers) {
    logger.error(
      `❌ The "${imports ? 'providers' : 'imports'}" of "${mainModule.getName()}" are not an array literal. Please add NgDoc ${imports ? 'providers' : 'imports'} manually.`,
    );

    return undefined;
  }

  const [router, ...components] = MODULE_APP.imports;
  const routerEdit: ArrayEdit | undefined = planRouterEdit(imports, router, logger);

  return [
    ...(routerEdit ? [routerEdit] : []),
    arrayEdit(imports, components, logger),
    arrayEdit(providers, MODULE_APP.providers, logger),
  ];
}

/**
 * Decides where the NgDoc routes go in an NgModule application.
 *
 * `RouterModule.forRoot` must be called once: a second call throws at startup. So an existing
 * call is extended, whether it is in the root module, in a module that the root module imports
 * (`AppRoutingModule`), or in a variable that the root module imports. When an imported module
 * cannot be inspected, nothing is added and the user is asked to add the routes.
 * @param imports - The `imports` array of the root module.
 * @param router - The `RouterModule.forRoot` entry.
 * @param logger - Receives what needs a manual change.
 */
function planRouterEdit(
  imports: ArrayLiteralExpression,
  router: ImportConstant,
  logger: logging.LoggerApi,
): ArrayEdit | undefined {
  const name: string = getEntryName(router);
  const found: RouterLocation[] = findRouterLocations(imports, name);
  const unknown: RouterLocation | undefined = found.find(
    (location: RouterLocation) => location.kind === 'unknown',
  );
  const calls: RouterLocation[] = found.filter(
    (location: RouterLocation) => location.kind !== 'unknown',
  );

  if (calls.length > 1) {
    logger.warn(
      `⚠️ "${name}" is called in ${calls.map((location: RouterLocation) => location.owner).join(', ')}. Keep one call and add "${router.routes}" to it manually.`,
    );

    return undefined;
  }

  const [location] = calls;

  if (location?.kind === 'array') {
    return arrayEdit(location.array, [router], logger);
  }

  if (location?.kind === 'call') {
    const call: CallExpression = location.call;

    return {
      file: call.getSourceFile(),
      entries: [router],
      apply: () => [extendCall(call, router, logger) ? 'extended' : 'unchanged'],
    };
  }

  if (unknown) {
    logger.warn(
      `⚠️ Could not check whether ${unknown.owner} calls "${name}", because its "imports" are not an array literal. Add "${router.routes}" to your router configuration manually.`,
    );

    return undefined;
  }

  return arrayEdit(imports, [router], logger);
}

/** Where a `RouterModule.forRoot` call was found, or an import that could not be inspected. */
type RouterLocation =
  | { kind: 'array'; array: ArrayLiteralExpression; owner: string }
  | { kind: 'call'; call: CallExpression; owner: string }
  | { kind: 'unknown'; owner: string };

/**
 * Looks for `name` calls in the `imports` of the root module and in what those imports refer to.
 * @param imports - The `imports` array of the root module.
 * @param name - The call to look for.
 */
function findRouterLocations(imports: ArrayLiteralExpression, name: string): RouterLocation[] {
  const locations: RouterLocation[] = [];

  if (findArrayEntries(imports, name).length) {
    locations.push({ kind: 'array', array: imports, owner: 'the root module' });
  }

  imports.getElements().forEach((element: Expression) => {
    const definition: Node | undefined = Node.isIdentifier(element)
      ? element.getDefinitionNodes()[0]
      : undefined;

    if (Node.isVariableDeclaration(definition)) {
      const initializer: Node | undefined = definition.getInitializer();

      if (Node.isCallExpression(initializer) && isEntry(initializer, name)) {
        locations.push({ kind: 'call', call: initializer, owner: `"${definition.getName()}"` });
      }

      return;
    }

    // Only modules of the application have a decorator here; library declarations have none.
    if (!Node.isClassDeclaration(definition) || !definition.getDecorator('NgModule')) {
      return;
    }

    const owner = `"${definition.getName()}"`;
    const moduleImports: Expression | undefined = getInitializer(definition, 'NgModule', 'imports');

    if (moduleImports && !Node.isArrayLiteralExpression(moduleImports)) {
      locations.push({ kind: 'unknown', owner });
    } else if (
      Node.isArrayLiteralExpression(moduleImports) &&
      findArrayEntries(moduleImports, name).length
    ) {
      locations.push({ kind: 'array', array: moduleImports, owner });
    }
  });

  return locations;
}

/**
 * Adds named imports to a file unless it already has them.
 * @param filePath - The file to update.
 * @param imports - The named imports.
 */
function addEntryImports(filePath: string, imports: EntityImport[]): void {
  imports.forEach((entityImport: EntityImport) =>
    addUniqueImport(filePath, entityImport.name, entityImport.path),
  );
}

/**
 * Returns the metadata object of an `@NgModule` class.
 * @param module - The module class.
 */
function getNgModuleMetadata(module: ClassDeclaration): ObjectLiteralExpression | undefined {
  const decorator = module.getDecorator('NgModule');

  if (!decorator) {
    return undefined;
  }

  const [metadata = decorator.addArgument('{}')] = decorator.getArguments();

  return Node.isObjectLiteralExpression(metadata) ? metadata : undefined;
}

/**
 * Resolves the options argument of `bootstrapApplication` to its object literal.
 * @param options - The object literal or the identifier of the application config.
 */
function getOptionsObject(
  options: Identifier | ObjectLiteralExpression,
): ObjectLiteralExpression | undefined {
  if (Node.isObjectLiteralExpression(options)) {
    return options;
  }

  const definition = options.getDefinitionNodes()[0];

  return definition?.getChildrenOfKind(SyntaxKind.ObjectLiteralExpression)[0];
}
