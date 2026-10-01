import path from 'node:path';
import process from 'node:process';
import { access, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const options = parseArguments(process.argv.slice(2));
// --workspace: the workspace whose paths the program uses (default: this script's own checkout).
const root = options.workspace ?? path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const generatorRoot = path.join(root, 'libs/builder/generator');
const baseConfigPath = path.join(root, 'tsconfig.base.json');
const entries = [
  { source: 'contracts', output: 'contracts' },
  { source: 'bootstrap/index', output: 'bootstrap/index' },
  { source: 'bootstrap/cli', output: 'bootstrap/cli' },
  { source: 'bootstrap/bin', output: 'bootstrap/bin' },
  { source: 'compiler/index', output: 'compiler/index' },
  { source: 'worker/index', output: 'worker/index' },
  { source: 'worker/entry', output: 'worker/entry' },
  { source: 'angular/application/index', output: 'angular/application' },
  { source: 'angular/dev-server/index', output: 'angular/dev-server' },
  { source: 'vite/index', output: 'vite/index' },
  { source: 'vite/angular/index', output: 'vite/angular/index' },
];
let emittedSources = new Set();

function usage() {
  return 'Usage: node tools/scripts/build-generator-types.mjs --outdir <generator-output-directory> [--workspace <root>] [--snapshot <input-snapshot>]';
}

function parseArguments(argv) {
  if (argv.length === 1 && !argv[0].startsWith('-')) return { output: argv[0] };
  const parsed = {};
  const names = { '--outdir': 'output', '--workspace': 'workspace', '--snapshot': 'snapshot' };
  for (let index = 0; index < argv.length; index += 2) {
    const name = names[argv[index]];
    if (!name || !argv[index + 1] || parsed[name] !== undefined) throw new Error(usage());
    parsed[name] = argv[index + 1];
  }
  if (!parsed.output) throw new Error(usage());
  return {
    output: parsed.output,
    workspace: parsed.workspace && path.resolve(parsed.workspace),
    snapshot: parsed.snapshot && path.resolve(parsed.snapshot),
  };
}

/**
 * With --snapshot (build-generator.mjs's private input snapshot), every workspace file the snapshot
 * holds is read from it, so the declarations derive from the same bytes as the bundle. Paths stay
 * the workspace's, so the emitted text is identical. Other files (legacy types, node_modules) are
 * read from the workspace.
 */
function snapshotReads(host) {
  if (!options.snapshot) return host;
  const redirect = (file) => {
    const relative = path.relative(root, file);
    if (
      !relative ||
      relative.startsWith('..') ||
      path.isAbsolute(relative) ||
      relative.split(path.sep)[0] === 'node_modules'
    )
      return undefined;
    const candidate = path.join(options.snapshot, relative);
    return ts.sys.fileExists(candidate) ? candidate : undefined;
  };
  host.readFile = (file) => ts.sys.readFile(redirect(file) ?? file);
  host.fileExists = (file) => redirect(file) !== undefined || ts.sys.fileExists(file);
  return host;
}

async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await files(filename)));
    else result.push(filename);
  }
  return result;
}

function relativeEsmSpecifier(specifier) {
  if (!specifier.startsWith('.') || path.posix.extname(specifier)) return specifier;
  return `${specifier}.js`;
}

function declarationPath(source) {
  const relative = path
    .relative(generatorRoot, source)
    .replace(/\\/g, '/')
    .replace(/\.tsx?$/, '');
  return entries.find((entry) => entry.source === relative)?.output ?? relative;
}

function declarationPathForSpecifier(sourceTarget) {
  const direct = path.join(generatorRoot, `${sourceTarget}.ts`);
  const directoryIndex = path.join(generatorRoot, sourceTarget, 'index.ts');
  if (emittedSources.has(direct)) return declarationPath(direct);
  if (emittedSources.has(directoryIndex)) return declarationPath(directoryIndex);
  return declarationPath(direct);
}

function normalizeRelativeSpecifiers(text, source) {
  // TypeScript preserves source specifiers in declaration emit. Published ESM declarations
  // must name their sibling JavaScript modules for NodeNext resolution.
  return text.replace(
    /((?:from|import)\s*\(?\s*['"])(\.{1,2}\/[^'"]+)(['"]\)?)/g,
    (whole, start, specifier, end) => {
      const sourceDirectory = path.posix.dirname(
        path
          .relative(generatorRoot, source)
          .replace(/\\/g, '/')
          .replace(/\.tsx?$/, ''),
      );
      const sourceTarget = path.posix.normalize(path.posix.join(sourceDirectory, specifier));
      const declarationTarget = declarationPathForSpecifier(sourceTarget);
      const declarationDirectory = path.posix.dirname(declarationPath(source));
      const rewritten = path.posix.relative(declarationDirectory, declarationTarget);
      const relative = rewritten.startsWith('.') ? rewritten : `./${rewritten}`;
      return `${start}${relativeEsmSpecifier(relative)}${end}`;
    },
  );
}

async function exists(filename) {
  try {
    await access(filename);
    return true;
  } catch {
    return false;
  }
}

async function verify(output) {
  for (const entry of entries) {
    const filename = path.join(output, `${entry.output}.d.ts`);
    if (!(await exists(filename)))
      throw new Error(`Declaration entry was not emitted: ${filename}`);
  }
  for (const filename of (await files(output)).filter((item) => item.endsWith('.d.ts'))) {
    const text = await readFile(filename, 'utf8');
    const imports = text.matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]\)?/g);
    for (const match of imports) {
      const specifier = match[1];
      if (!specifier.endsWith('.js')) {
        throw new Error(
          `Extensionless relative declaration specifier in ${filename}: ${specifier}`,
        );
      }
      const target = path.resolve(path.dirname(filename), `${specifier.slice(0, -3)}.d.ts`);
      if (!(await exists(target))) {
        throw new Error(`Declaration dependency is missing: ${filename} -> ${specifier}`);
      }
    }
  }
}

async function main() {
  const output = path.resolve(root, options.output);
  await stat(output).catch(() => {
    throw new Error(`Output directory must be created by the runtime build: ${output}`);
  });
  const host = snapshotReads(ts.createCompilerHost({}));
  const config = ts.readConfigFile(baseConfigPath, (file) => host.readFile(file));
  if (config.error)
    throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  const baseOptions = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    root,
    undefined,
    baseConfigPath,
  ).options;
  const compilerOptions = {
    ...baseOptions,
    declaration: true,
    emitDeclarationOnly: true,
    declarationMap: false,
    module: ts.ModuleKind.Preserve,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    outDir: output,
    noEmitOnError: false,
    allowJs: false,
    ignoreDeprecations: '6.0',
  };
  const program = ts.createProgram(
    entries.map((entry) => path.join(generatorRoot, `${entry.source}.ts`)),
    compilerOptions,
    snapshotReads(ts.createCompilerHost(compilerOptions)),
  );
  const diagnostics = ts.getPreEmitDiagnostics(program);
  const declarations = new Map();
  const declarationEmit = program.emit(undefined, (filename, text, _bom, _error, sourceFiles) => {
    if (!filename.endsWith('.d.ts')) return;
    const source = sourceFiles?.[0]?.fileName;
    if (!source || !source.startsWith(`${generatorRoot}${path.sep}`)) return;
    declarations.set(source, text);
  });
  const errors = [...diagnostics, ...declarationEmit.diagnostics].filter(
    (item) => item.category === ts.DiagnosticCategory.Error,
  );
  if (errors.length) {
    const formatter = ts.formatDiagnosticsWithColorAndContext(errors, {
      getCanonicalFileName: (name) => name,
      getCurrentDirectory: () => root,
      getNewLine: () => '\n',
    });
    throw new Error(`Unable to emit generator declarations:\n${formatter}`);
  }
  emittedSources = new Set(declarations.keys());
  for (const [source, text] of declarations) {
    const filename = path.join(output, `${declarationPath(source)}.d.ts`);
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, normalizeRelativeSpecifiers(text, source));
  }
  await verify(output);
  console.log(
    `Emitted portable generator declarations (${entries.length} public entries) to ${output}.`,
  );
}

await main();
