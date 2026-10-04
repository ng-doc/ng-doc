import { logging } from '@angular-devkit/core';
import {
  ArrayLiteralExpression,
  CallExpression,
  Expression,
  Identifier,
  ImportSpecifier,
  Node,
  ObjectLiteralExpression,
  SourceFile,
  SyntaxKind,
} from 'ng-morph';

import { DROPPED_FEATURES, ImportConstant } from '../constants/modules';

/** What `addArrayEntries` did with an entry. */
export type ArrayEntryResult = 'added' | 'extended' | 'unchanged' | 'skipped';

/** The part of the schematic logger that the helpers report to. */
export type EntryLogger = Pick<logging.LoggerApi, 'info' | 'warn'>;

/**
 * Returns the name that identifies an entry: the text of the initializer before its first `(`,
 * for example `provideRouter`, `RouterModule.forRoot` or `NgDocRootComponent`.
 * @param entry - The entry to name.
 */
export function getEntryName(entry: ImportConstant): string {
  return getCallName(entry.initializer);
}

/**
 * Tells whether an expression is a call of `name` or the identifier `name`. A call through a
 * namespace import (`router.provideRouter(...)`) matches too.
 * @param node - The expression to check.
 * @param name - The function or identifier name, as returned by `getEntryName`.
 */
export function isEntry(node: Node, name: string): boolean {
  const text: string = Node.isCallExpression(node)
    ? node.getExpression().getText()
    : node.getText();

  return text === name || text.endsWith(`.${name}`);
}

/**
 * Finds every element of an array that is a call of `name` or the identifier `name`.
 * @param array - The array to search.
 * @param name - The function or identifier name, as returned by `getEntryName`.
 */
export function findArrayEntries(array: ArrayLiteralExpression, name: string): Expression[] {
  return array.getElements().filter((element: Expression) => isEntry(element, name));
}

/**
 * Adds entries to an `imports` or `providers` array, or extends the calls that are already there.
 *
 * An existing call keeps its own arguments; only the routes, features and options it lacks are
 * added, so running `ng add` again, or on an application that already calls `provideRouter` or
 * `provideHttpClient`, never registers them twice. Several calls of the same provider (as the
 * previous `ng add` left them) are merged into the first one. New entries are appended in one
 * edit, on separate lines when the array already spans several lines.
 * @param array - The array literal to update.
 * @param entries - The entries to add, in order.
 * @param logger - Receives what was merged and what needs a manual change.
 * @returns What happened to each entry, in the order of `entries`.
 */
export function addArrayEntries(
  array: ArrayLiteralExpression,
  entries: ImportConstant[],
  logger: EntryLogger,
): ArrayEntryResult[] {
  // Decided before any call is extended, since extending a call may add line breaks inside it.
  const multiline: boolean = array.getText().includes('\n');
  const added: string[] = [];
  const results: ArrayEntryResult[] = entries.map((entry: ImportConstant) => {
    const name: string = getEntryName(entry);
    const existing: Expression[] = findArrayEntries(array, name);

    if (!existing.length) {
      added.push(entry.initializer);

      return 'added';
    }

    const calls: CallExpression[] = existing.filter(Node.isCallExpression);

    if (!calls.length) {
      return 'unchanged';
    }

    if (calls.length > 1) {
      if (entry.options) {
        // Options objects cannot be merged safely; a second `forRoot` throws at startup anyway.
        logger.warn(
          `⚠️ "${name}" is called ${calls.length} times. Keep one call and add "${entry.routes}" to it manually.`,
        );

        return 'skipped';
      }

      extendCall(mergeCalls(array, calls, entry, logger), entry, logger);

      return 'extended';
    }

    return extendCall(calls[0], entry, logger) ? 'extended' : 'unchanged';
  });

  if (added.length) {
    array.addElements(added, { useNewLines: multiline });
  }

  return results;
}

/**
 * Adds the routes, features and options of an entry that an existing call lacks.
 * @param call - The existing call.
 * @param entry - The entry that describes what the call needs.
 * @param logger - Receives what needs a manual change.
 * @returns Whether the call changed.
 */
export function extendCall(
  call: CallExpression,
  entry: ImportConstant,
  logger: EntryLogger,
): boolean {
  const changes: boolean[] = [
    entry.routes ? addRoutes(call, entry.routes, logger) : false,
    ...(entry.features ?? []).map((feature: string) => addFeature(call, feature)),
    entry.options ? addOptions(call, getEntryName(entry), entry.options, logger) : false,
  ];

  return changes.some(Boolean);
}

/**
 * Returns the array literal of an object literal property, creating `name: []` when the property
 * is missing. Returns `undefined` when the property is not an array literal (for example a
 * variable), because it cannot be edited safely.
 * @param objectLiteral - The object literal that owns the property.
 * @param name - The property name.
 */
export function getArrayProperty(
  objectLiteral: ObjectLiteralExpression,
  name: string,
): ArrayLiteralExpression | undefined {
  const property = objectLiteral.getProperty(name) ?? objectLiteral.addProperty(`${name}: []`);

  if (!Node.isPropertyAssignment(property)) {
    return undefined;
  }

  const initializer: Expression | undefined = property.getInitializer();

  return Node.isArrayLiteralExpression(initializer) ? initializer : undefined;
}

/**
 * Merges several calls of one provider into the first. Routes are concatenated in call order,
 * which is the order in which two `provideRouter` calls registered them. Features are kept once
 * by name; when two calls pass the same feature, the later one wins, as it did in the injector.
 * Deprecated features that the previous `ng add` added are dropped.
 * @param array - The array that holds the calls.
 * @param calls - The calls, in array order.
 * @param entry - The entry the calls belong to.
 * @param logger - Receives the merge.
 * @returns The merged call.
 */
function mergeCalls(
  array: ArrayLiteralExpression,
  calls: CallExpression[],
  entry: ImportConstant,
  logger: EntryLogger,
): CallExpression {
  const routes: string[] = [];
  const features: Map<string, string> = new Map();
  const dropped: string[] = [];

  calls.forEach((call: CallExpression) => {
    const args: Node[] = call.getArguments();

    if (entry.routes && args[0]) {
      const [first] = args;
      const parts: string[] = Node.isArrayLiteralExpression(first)
        ? first.getElements().map((element: Expression) => element.getText())
        : [`...${first.getText()}`];

      parts
        .filter((part: string) => !routes.includes(part))
        .forEach((part: string) => routes.push(part));
    }

    (entry.routes ? args.slice(1) : args).forEach((argument: Node) => {
      const text: string = argument.getText();
      const name: string = Node.isCallExpression(argument) ? getCallName(text) : text;

      if (DROPPED_FEATURES.includes(name)) {
        dropped.push(name);
      } else {
        features.set(name, text);
      }
    });
  });

  const [first, ...rest] = calls;
  const callee: string = first.getExpression().getText();
  const args: string[] = [
    ...(entry.routes ? [`[${routes.join(', ')}]`] : []),
    ...features.values(),
  ];

  const sourceFile: SourceFile = array.getSourceFile();

  rest.forEach((call: CallExpression) => array.removeElement(call));

  const merged = first.replaceWithText(`${callee}(${args.join(', ')})`) as CallExpression;

  removeUnusedImports(sourceFile, dropped);
  logger.info(`🔄 Merged ${calls.length} "${getEntryName(entry)}" calls into one.`);

  return merged;
}

/**
 * Makes the first argument of a router call include `routes`. The application's own routes stay
 * first, which keeps their precedence the same as when the routes were registered by two calls,
 * except that the routes go before a trailing wildcard (`**`) route, which would hide them.
 * @param call - The router call.
 * @param routes - The identifier of the routes to include.
 * @param logger - Receives the wildcard warnings.
 */
function addRoutes(call: CallExpression, routes: string, logger: EntryLogger): boolean {
  const [first] = call.getArguments();

  if (!first) {
    call.addArgument(routes);

    return true;
  }

  const mentioned: boolean = [first, ...first.getDescendantsOfKind(SyntaxKind.Identifier)].some(
    (node: Node) => Node.isIdentifier(node) && node.getText() === routes,
  );

  if (mentioned) {
    return false;
  }

  if (Node.isArrayLiteralExpression(first)) {
    const wildcard: number = first.getElements().findIndex(isWildcardRoute);

    if (wildcard === -1) {
      first.addElement(`...${routes}`);
    } else {
      first.insertElement(wildcard, `...${routes}`);
    }

    return true;
  }

  warnAboutWildcard(first, routes, logger);
  first.replaceWithText(`[...${first.getText()}, ...${routes}]`);

  return true;
}

/**
 * Warns when routes that are not written inline may end with a wildcard route, which would hide
 * the routes appended after them.
 * @param routesArgument - The routes argument of the router call.
 * @param routes - The identifier of the routes that are appended.
 * @param logger - Receives the warning.
 */
function warnAboutWildcard(routesArgument: Node, routes: string, logger: EntryLogger): void {
  const definition: Node | undefined = Node.isIdentifier(routesArgument)
    ? routesArgument.getDefinitionNodes()[0]
    : undefined;
  const initializer: Node | undefined = Node.isVariableDeclaration(definition)
    ? definition.getInitializer()
    : undefined;

  if (Node.isArrayLiteralExpression(initializer)) {
    if (initializer.getElements().some(isWildcardRoute)) {
      logger.warn(
        `⚠️ "${routesArgument.getText()}" has a wildcard ("**") route that hides "${routes}". Move it after "${routes}".`,
      );
    }

    return;
  }

  logger.warn(
    `⚠️ "${routes}" is added after "${routesArgument.getText()}". If those routes end with a wildcard ("**") route, move it after "${routes}".`,
  );
}

/**
 * Tells whether a route literal is a wildcard route (`{path: '**', ...}`).
 * @param node - An element of a routes array.
 */
function isWildcardRoute(node: Node): boolean {
  if (!Node.isObjectLiteralExpression(node)) {
    return false;
  }

  const path = node.getProperty('path');
  const value: Node | undefined = Node.isPropertyAssignment(path)
    ? path.getInitializer()
    : undefined;

  return Node.isStringLiteral(value) || Node.isNoSubstitutionTemplateLiteral(value)
    ? value.getLiteralValue() === '**'
    : false;
}

/**
 * Appends a feature call unless the call already passes a feature with the same function name.
 * @param call - The call to extend.
 * @param feature - The feature call, for example `withInterceptorsFromDi()`.
 */
function addFeature(call: CallExpression, feature: string): boolean {
  const name: string = getCallName(feature);
  const present: boolean = call
    .getArguments()
    .some((argument: Node) => Node.isCallExpression(argument) && isEntry(argument, name));

  if (present) {
    return false;
  }

  call.addArgument(feature);

  return true;
}

/**
 * Adds the options a call does not set yet. An options object that is not an object literal is
 * left alone, because its properties cannot be inspected; the logger says what to set.
 * @param call - The call whose second argument holds the options.
 * @param name - The name of the call, for the warning.
 * @param options - The property names and initializers to set.
 * @param logger - Receives the warning.
 */
function addOptions(
  call: CallExpression,
  name: string,
  options: Array<[string, string]>,
  logger: EntryLogger,
): boolean {
  const [, current] = call.getArguments();
  const text: string = options
    .map(([property, initializer]: [string, string]) => `${property}: ${initializer}`)
    .join(', ');

  if (!current) {
    call.addArgument(`{${text}}`);

    return true;
  }

  if (!Node.isObjectLiteralExpression(current)) {
    logger.warn(
      `⚠️ The options of "${name}" ("${current.getText()}") are not an object literal. Set {${text}} in them manually.`,
    );

    return false;
  }

  const missing = options.filter(([property]: [string, string]) => !current.getProperty(property));

  if (!missing.length) {
    return false;
  }

  const added: string[] = missing.map(
    ([property, initializer]: [string, string]) => `${property}: ${initializer}`,
  );

  if (current.getText().includes('\n')) {
    missing.forEach(([property, initializer]: [string, string]) =>
      current.addPropertyAssignment({ name: property, initializer }),
    );
  } else {
    // ts-morph puts every added property on a new line; a one-line object stays on one line.
    const source: string = current.getText();
    const body: string = source.slice(1, -1).trim().replace(/,$/, '');
    const inner: string = [body, ...added].filter(Boolean).join(', ');

    current.replaceWithText(/^\{\s/.test(source) ? `{ ${inner} }` : `{${inner}}`);
  }

  return true;
}

/**
 * Removes named imports that the file no longer uses (the features dropped by `mergeCalls`).
 * @param sourceFile - The file to clean up.
 * @param names - The imported names to check.
 */
function removeUnusedImports(sourceFile: SourceFile, names: string[]): void {
  names.forEach((name: string) => {
    const used: boolean = sourceFile
      .getDescendantsOfKind(SyntaxKind.Identifier)
      .some(
        (identifier: Identifier) =>
          identifier.getText() === name &&
          !identifier.getFirstAncestorByKind(SyntaxKind.ImportDeclaration),
      );

    if (used) {
      return;
    }

    sourceFile.getImportDeclarations().forEach((declaration) => {
      const specifier: ImportSpecifier | undefined = declaration
        .getNamedImports()
        .find((named: ImportSpecifier) => named.getName() === name && !named.getAliasNode());

      if (!specifier) {
        return;
      }

      specifier.remove();

      if (
        !declaration.getNamedImports().length &&
        !declaration.getDefaultImport() &&
        !declaration.getNamespaceImport()
      ) {
        declaration.remove();
      }
    });
  });
}

/**
 * Returns the text of a call before its first `(`.
 * @param text - The call, for example `withInterceptorsFromDi()`.
 */
function getCallName(text: string): string {
  const index: number = text.indexOf('(');

  return index === -1 ? text : text.slice(0, index);
}
