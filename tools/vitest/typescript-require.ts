import { existsSync, readFileSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type * as TypeScript from 'typescript';

import { workspaceAliases } from './workspace-aliases';

/**
 * Vitest setup file for suites whose code under test is loaded by a package, not by the spec:
 * `SchematicTestRunner` `require`s the factories named in `collection.json`. Node resolves and
 * runs those requires itself, outside Vitest's transform, so this hook lets them load the
 * TypeScript sources:
 *
 * - an extensionless specifier resolves to its `.ts` file (or `index.ts`);
 * - the `@ng-doc/*` path mappings resolve to the sources;
 * - a workspace `.ts` file is compiled to CommonJS with the compiler options of the nearest
 *   `tsconfig.spec.json`.
 *
 * TypeScript's CommonJS output reads every imported function from the exporting module object at
 * call time, so a spec that `require`s a module gets the instance the schematic uses and can spy
 * on its exports.
 */

const REGISTERED = Symbol.for('ng-doc.vitest.typescript-require');
const workspace = path.resolve(import.meta.dirname, '../..');
const ts = createRequire(import.meta.url)('typescript') as typeof TypeScript;
const aliases = workspaceAliases(workspace);
const options = new Map<string, TypeScript.CompilerOptions>();

/**
 * The TypeScript file a specifier names, when Node's own resolution cannot find it.
 * @param specifier - The specifier as required.
 * @param parentURL - The URL of the requiring module.
 * @returns The file, or undefined.
 */
function typescriptFile(specifier: string, parentURL: string | undefined): string | undefined {
  let base: string | undefined;
  const alias = aliases.find(({ find }) => find.test(specifier));

  if (alias) base = specifier.replace(alias.find, alias.replacement);
  else if (specifier.startsWith('file:')) base = fileURLToPath(specifier);
  else if (path.isAbsolute(specifier)) base = specifier;
  else if (/^\.\.?(\/|$)/.test(specifier) && parentURL?.startsWith('file:'))
    base = path.resolve(path.dirname(fileURLToPath(parentURL)), specifier);
  if (!base || base.includes(`${path.sep}node_modules${path.sep}`)) return undefined;

  return [base, `${base}.ts`, path.join(base, 'index.ts')].find(
    (file) => file.endsWith('.ts') && existsSync(file),
  );
}

/**
 * The compiler options of the nearest `tsconfig.spec.json`, set to emit CommonJS.
 * @param file - The TypeScript file to compile.
 * @returns The options.
 */
function compilerOptions(file: string): TypeScript.CompilerOptions {
  let folder = path.dirname(file);

  while (!existsSync(path.join(folder, 'tsconfig.spec.json')) && folder !== workspace)
    folder = path.dirname(folder);

  const config = path.join(folder, 'tsconfig.spec.json');
  let result = options.get(config);

  if (!result) {
    const parsed = existsSync(config)
      ? ts.getParsedCommandLineOfConfigFile(
          config,
          {},
          {
            ...ts.sys,
            onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
              throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
            },
          },
        )?.options
      : undefined;

    result = {
      ...parsed,
      module: ts.ModuleKind.CommonJS,
      noEmit: false,
      declaration: false,
      sourceMap: false,
      inlineSourceMap: true,
      inlineSources: true,
    };
    options.set(config, result);
  }

  return result;
}

if (!(globalThis as Record<symbol, unknown>)[REGISTERED]) {
  (globalThis as Record<symbol, unknown>)[REGISTERED] = true;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const file = typescriptFile(specifier, context.parentURL);

      return file
        ? { url: pathToFileURL(file).href, format: 'commonjs', shortCircuit: true }
        : nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
      if (!url.startsWith('file:') || !url.endsWith('.ts') || url.includes('/node_modules/'))
        return nextLoad(url, context);

      const file = fileURLToPath(url);
      const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), {
        compilerOptions: compilerOptions(file),
        fileName: file,
      });

      return { format: 'commonjs', source: outputText, shortCircuit: true };
    },
  });
}
