import { Tree } from '@angular-devkit/schematics';
import { posix } from 'path';
import * as ts from 'typescript';

function parse(file: string, text: string): ts.SourceFile {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

/** Resolves a relative module specifier to a `.ts` file of the tree, or undefined. */
function resolveModule(tree: Tree, from: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.')) return undefined;
  const base = posix.join(posix.dirname(from), specifier);
  return [`${base}.ts`, posix.join(base, 'index.ts'), base].find(
    (candidate) => candidate.endsWith('.ts') && tree.exists(candidate),
  );
}

/** The file that declares an identifier imported (or declared) in a source file. */
function declarationFile(
  tree: Tree,
  file: string,
  source: ts.SourceFile,
  name: string,
): string | undefined {
  for (const statement of source.statements) {
    if (ts.isClassDeclaration(statement) && statement.name?.text === name) return file;
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    const bindings = statement.importClause?.namedBindings;
    const named =
      bindings && ts.isNamedImports(bindings)
        ? bindings.elements.some((element) => element.name.text === name)
        : false;
    if (named || statement.importClause?.name?.text === name) {
      return resolveModule(tree, file, statement.moduleSpecifier.text);
    }
  }
  return undefined;
}

function findCall(source: ts.Node, names: string[]): ts.CallExpression | undefined {
  let found: ts.CallExpression | undefined;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const name = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : undefined;
      if (name && names.includes(name)) {
        found = node;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** The first identifier of `bootstrap: [...]` in an `@NgModule` of the file. */
function moduleBootstrapComponent(source: ts.SourceFile): string | undefined {
  let found: string | undefined;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'bootstrap' &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      const first = node.initializer.elements[0];
      if (first && ts.isIdentifier(first)) found = first.text;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/**
 * Finds the root component of an application from its browser entry: the first argument of
 * `bootstrapApplication(...)`, or the `bootstrap` component of the module passed to
 * `bootstrapModule(...)`. Returns its workspace-relative file, or undefined when the entry does not
 * follow either pattern.
 */
export function findRootComponent(tree: Tree, browserEntry: string): string | undefined {
  if (!tree.exists(browserEntry)) return undefined;
  const source = parse(browserEntry, tree.readText(browserEntry));
  const call = findCall(source, ['bootstrapApplication', 'bootstrapModule']);
  const argument = call?.arguments[0];
  if (!call || !argument || !ts.isIdentifier(argument)) return undefined;
  const file = declarationFile(tree, browserEntry, source, argument.text);
  const callee = call.expression;
  const isModule = ts.isPropertyAccessExpression(callee) && callee.name.text === 'bootstrapModule';
  if (!file || !isModule) return file;
  const moduleSource = parse(file, tree.readText(file));
  const component = moduleBootstrapComponent(moduleSource);
  return component ? declarationFile(tree, file, moduleSource, component) : undefined;
}

/**
 * Whether a file declares a class of that name with an `@NgModule` decorator.
 * @param tree - The workspace tree.
 * @param file - The file, workspace-relative.
 * @param name - The class name.
 */
function declaresNgModule(tree: Tree, file: string, name: string): boolean {
  const source = parse(file, tree.readText(file));
  return source.statements.some(
    (statement) =>
      ts.isClassDeclaration(statement) &&
      statement.name?.text === name &&
      (ts.getDecorators(statement) ?? []).some(
        (decorator) =>
          ts.isCallExpression(decorator.expression) &&
          ts.isIdentifier(decorator.expression.expression) &&
          decorator.expression.expression.text === 'NgModule',
      ),
  );
}

/**
 * The name of the NgModule that a server entry exports as its default export
 * (`export { AppServerModule as default } from './app/app.module.server'`, as `ng new
 * --no-standalone --ssr` writes it, `export default AppServerModule`, or an exported decorated
 * class), or undefined when the default export is anything else, such as a bootstrap function.
 * @param tree - The workspace tree.
 * @param file - The server entry, workspace-relative.
 */
export function serverEntryNgModule(tree: Tree, file: string): string | undefined {
  if (!tree.exists(file)) return undefined;
  const source = parse(file, tree.readText(file));
  for (const statement of source.statements) {
    if (
      ts.isClassDeclaration(statement) &&
      statement.name &&
      statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)
    ) {
      return declaresNgModule(tree, file, statement.name.text) ? statement.name.text : undefined;
    }
    if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      if (!ts.isIdentifier(statement.expression)) return undefined;
      const name = statement.expression.text;
      const target = declarationFile(tree, file, source, name);
      return target && declaresNgModule(tree, target, name) ? name : undefined;
    }
    if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      const element = statement.exportClause.elements.find((item) => item.name.text === 'default');
      if (!element) continue;
      const name = (element.propertyName ?? element.name).text;
      const target =
        statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
          ? resolveModule(tree, file, statement.moduleSpecifier.text)
          : declarationFile(tree, file, source, name);
      return target && declaresNgModule(tree, target, name) ? name : undefined;
    }
  }
  return undefined;
}

/** The import that provides `withNgDocContentReady`. */
export const CONTENT_READY_IMPORT = "import { withNgDocContentReady } from '@ng-doc/app/helpers';";

/**
 * Wraps the default export of a server entry (`main.server.ts`) with `withNgDocContentReady`, so a
 * prerendered page waits for its NgDoc content and a content failure fails the route. Returns the
 * new text, the same text when it is already wrapped, or undefined when the default export is not
 * an expression (`export { AppServerModule as default }`) and the entry needs a manual change.
 */
export function wrapServerEntry(file: string, text: string): string | undefined {
  if (text.includes('withNgDocContentReady')) return text;
  const source = parse(file, text);
  const assignment = source.statements.find(
    (statement): statement is ts.ExportAssignment =>
      ts.isExportAssignment(statement) && !statement.isExportEquals,
  );
  if (!assignment) return undefined;
  const expression = assignment.expression;
  const wrapped =
    text.slice(0, expression.getStart(source)) +
    `withNgDocContentReady(${expression.getText(source)})` +
    text.slice(expression.getEnd());
  const imports = source.statements.filter(ts.isImportDeclaration);
  const last = imports[imports.length - 1];
  if (!last) return `${CONTENT_READY_IMPORT}\n\n${wrapped}`;
  const end = last.getEnd();
  return `${wrapped.slice(0, end)}\n${CONTENT_READY_IMPORT}${wrapped.slice(end)}`;
}
