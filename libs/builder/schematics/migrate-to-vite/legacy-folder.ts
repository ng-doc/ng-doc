import { Tree } from '@angular-devkit/schematics';
import { posix } from 'path';

import { MigrationFinding } from './analyze';
import { JsonFile } from './setup/json-file';
import { JsonLike, JsonRecord, WorkspaceProject, WorkspaceTarget } from './setup/workspace';

/**
 * The `outDir` of the kept legacy targets. The legacy engine writes `<outDir>/ng-doc/<project>`, so
 * their generated folder is `ng-doc-legacy/ng-doc/<project>`, as for NgDoc's own site.
 */
export const LEGACY_OUT_DIR = 'ng-doc-legacy';

/** The `.gitignore` line for the legacy targets' generated files. */
export const LEGACY_OUT_DIR_IGNORE = `/${LEGACY_OUT_DIR}`;

/** One value of a kept legacy target that the migration changed, so it can be changed back. */
export interface LegacyTargetEdit {
  /** The legacy target, such as `build-legacy`. */
  target: string;
  /** The JSON path of the value inside the target, such as `['options', 'tsConfig']`. */
  path: string[];
  /** The value before the migration; absent when the migration added it. */
  before?: JsonLike;
  after: JsonLike;
}

/** How the kept legacy targets get a generated folder of their own. */
export interface LegacyFolderPlan {
  /** Their generated folder, workspace-relative. */
  folder: string;
  /** The files to create (the legacy NgDoc configuration and tsconfig files), by path. */
  files: { [file: string]: string };
  edits: LegacyTargetEdit[];
  findings: MigrationFinding[];
}

/** What `planLegacyFolder` needs to know about the migration. */
export interface LegacyFolderInput {
  /** The project before the migration, with its original targets. */
  project: WorkspaceProject;
  /** The original build target, and the name it is kept under. */
  build: { name: string; legacyName: string };
  /** The original serve target, and the name it is kept under. */
  serve?: { name: string; legacyName: string };
  /** The folder the legacy engine wrote before the migration, which the Vite engine now owns. */
  legacyOutput: string;
  /** The NgDoc configuration the legacy build target loads, if any. */
  ngDocConfig?: string;
  /** Files a previous run of the migration created, which may be written again. */
  owned: ReadonlySet<string>;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizePath(value: string): string {
  const normalized = posix.normalize(value.replace(/\\/g, '/')).replace(/^\.\/|\/$/g, '');
  return normalized === '.' ? '' : normalized;
}

/** A path relative to a folder, in the `./` form tsconfig `paths` need without a `baseUrl`. */
function relativeTo(folder: string, file: string): string {
  const relative = posix.relative(folder || '.', file) || '.';
  return relative.startsWith('.') ? relative : `./${relative}`;
}

function within(file: string, folder: string): boolean {
  return file === folder || file.startsWith(`${folder}/`);
}

/** The `paths` and `baseUrl` a tsconfig compiles with: the nearest of each along `extends`. */
interface CompilerPaths {
  paths: { [alias: string]: string[] };
  /** The folder `paths` entries are resolved from: `baseUrl`, else the file that sets `paths`. */
  base: string;
  /** Whether that folder is an inherited `baseUrl`, which a file extending this one inherits too. */
  baseUrl: boolean;
}

function readCompilerPaths(tree: Tree, file: string): CompilerPaths | undefined {
  const seen = new Set<string>();
  let paths: { file: string; value: { [alias: string]: string[] } } | undefined;
  let baseUrl: string | undefined;
  let current: string | undefined = file;
  while (current && !seen.has(current) && (!paths || baseUrl === undefined)) {
    if (!tree.exists(current) && tree.exists(`${current}.json`)) current = `${current}.json`;
    if (!tree.exists(current)) break;
    seen.add(current);
    const json: JsonFile = new JsonFile(tree, current);
    const value = json.get(['compilerOptions', 'paths']);
    if (!paths && isRecord(value)) {
      paths = { file: current, value: value as { [alias: string]: string[] } };
    }
    const url = json.get(['compilerOptions', 'baseUrl']);
    if (baseUrl === undefined && typeof url === 'string') {
      baseUrl = normalizePath(posix.join(posix.dirname(current), url));
    }
    const extended: unknown = json.get(['extends']);
    // Only a relative `extends` can hold the project's own mappings; a package's tsconfig doesn't.
    current =
      typeof extended === 'string' && extended.startsWith('.')
        ? normalizePath(posix.join(posix.dirname(current), extended))
        : undefined;
  }
  if (!paths) return undefined;
  return {
    paths: paths.value,
    base: baseUrl ?? normalizePath(posix.dirname(paths.file)),
    baseUrl: baseUrl !== undefined,
  };
}

/**
 * The `paths` of a tsconfig for the legacy targets: every mapping into the legacy engine's old
 * folder points into its new one, and the other mappings stay as they resolve today. TypeScript
 * replaces `paths` as a whole, so the file repeats every mapping. Returns undefined when no
 * mapping points into the old folder: the legacy build would not import its own pages then.
 */
function legacyPaths(
  compiler: CompilerPaths,
  folder: string,
  from: string,
  to: string,
): { [alias: string]: string[] } | undefined {
  // Without an inherited `baseUrl`, the new file's own folder resolves the entries it writes.
  const base = compiler.baseUrl ? compiler.base : folder;
  let moved = false;
  const paths = Object.fromEntries(
    Object.entries(compiler.paths).map(([alias, entries]) => [
      alias,
      (Array.isArray(entries) ? entries : []).map((entry) => {
        if (typeof entry !== 'string') return entry;
        const resolved = normalizePath(posix.join(compiler.base, entry));
        if (within(resolved, from)) {
          moved = true;
          const next = posix.join(to, posix.relative(from, resolved));
          return compiler.baseUrl ? posix.relative(base || '.', next) : relativeTo(base, next);
        }
        return compiler.baseUrl ? entry : relativeTo(base, resolved);
      }),
    ]),
  );
  return moved ? paths : undefined;
}

/** `tsconfig.app.json` → `tsconfig.app.legacy.json`, keeping the folder and any Nx tokens. */
function legacyName(file: string, extension: string): string {
  const match = /\.(json|ts|js|mjs|cjs|mts|cts)$/.exec(file);
  return `${match ? file.slice(0, -match[0].length) : file}.legacy${extension}`;
}

function legacyConfigText(source: string | undefined, file: string): string {
  const header = [
    '// The NgDoc configuration of the legacy builders (`build-legacy`, `serve-legacy`), created by',
    `// \`ng g @ng-doc/builder:migrate-to-vite\`. Their generated files go to \`${LEGACY_OUT_DIR}/\`, so`,
    "// they never share a folder with the Vite engine, which refuses files it didn't write.",
    "import type { NgDocConfiguration } from '@ng-doc/builder';",
    '',
  ];
  if (!source) {
    return [
      ...header,
      `const legacyConfig: NgDocConfiguration = { outDir: '${LEGACY_OUT_DIR}' };`,
      '',
      'export default legacyConfig;',
      '',
    ].join('\n');
  }
  const specifier = relativeTo(
    posix.dirname(file),
    source.replace(/\.(ts|js|mjs|cjs|mts|cts)$/, ''),
  );
  return [
    ...header,
    `import config from '${specifier}';`,
    '',
    `const legacyConfig: NgDocConfiguration = { ...config, outDir: '${LEGACY_OUT_DIR}' };`,
    '',
    'export default legacyConfig;',
    '',
  ].join('\n');
}

function legacyTsconfigText(extended: string, paths: { [alias: string]: string[] }): string {
  const body = JSON.stringify({ extends: `./${extended}`, compilerOptions: { paths } }, null, 2);
  return [
    '/* The tsconfig of the legacy builders (`build-legacy`, `serve-legacy`), created by',
    '   `ng g @ng-doc/builder:migrate-to-vite`. It maps `@ng-doc/generated` to their own',
    `   generated folder in \`${LEGACY_OUT_DIR}/\`. */`,
    body,
    '',
  ].join('\n');
}

/**
 * Plans a generated folder of their own for the legacy targets that the migration keeps.
 *
 * Both engines write `<outDir>/ng-doc/<project>` by default. The Vite engine refuses to overwrite
 * files it didn't write (`OUTPUT_UNOWNED_COLLISION`), and the legacy engine deletes and rewrites
 * its folder, so a single `build-legacy` run would stop the next `serve`. The legacy targets
 * therefore load a small NgDoc configuration with `outDir: 'ng-doc-legacy'`, compile with a
 * tsconfig that maps `@ng-doc/generated` there, and copy their generated assets from there. The
 * Vite engine keeps the folder and the mappings the project already has. Returns only findings
 * when the targets can't be changed safely, and they keep sharing the folder.
 * @param tree - The workspace tree.
 * @param input - The migration.
 */
export function planLegacyFolder(tree: Tree, input: LegacyFolderInput): LegacyFolderPlan {
  const { project, legacyOutput, owned } = input;
  const folder = posix.join(LEGACY_OUT_DIR, 'ng-doc', project.name);
  const build = project.targets[input.build.name]!;
  const serve = input.serve ? project.targets[input.serve.name] : undefined;
  const findings: MigrationFinding[] = [];
  const shared = (subject: string, reason: string): LegacyFolderPlan => ({
    folder,
    files: {},
    edits: [],
    findings: [
      {
        level: 'manual',
        subject,
        message:
          `${reason} The legacy targets keep writing \`${legacyOutput}\`, the Vite engine's ` +
          `folder: delete it before you switch engines, or give the legacy targets their own ` +
          `folder (\`outDir: '${LEGACY_OUT_DIR}'\` in their NgDoc configuration, with ` +
          '`@ng-doc/generated` and the generated assets entry pointing there).',
      },
    ],
  });
  // Nx interpolates these in options; the files are read at the resolved paths.
  const nx = (value: string) =>
    normalizePath(
      value
        .replace(/\{workspaceRoot\}\/?/g, '')
        .replace(/\{projectRoot\}/g, project.root || '.')
        .replace(/\{projectName\}/g, project.name),
    );

  if (folder === legacyOutput) {
    // The Vite engine follows the configuration's `outDir` too, so it already writes this folder.
    return shared(
      'ngDoc.outDir',
      `is \`${LEGACY_OUT_DIR}\`, the folder the legacy targets would get.`,
    );
  }

  const files: { [file: string]: string } = {};
  const edits: LegacyTargetEdit[] = [];
  const create = (file: string, text: string): boolean => {
    if (tree.exists(file) && !owned.has(file)) return false;
    files[file] = text;
    return true;
  };
  const edit = (target: string, path: string[], before: JsonLike | undefined, after: JsonLike) => {
    edits.push({ target, path, ...(before === undefined ? {} : { before }), after });
  };

  // The NgDoc configuration: the build target's, with the legacy `outDir` over it.
  const serveConfig = isRecord(serve?.options?.['ngDoc'])
    ? (serve!.options!['ngDoc'] as JsonRecord)['config']
    : undefined;
  if (typeof serveConfig === 'string' && normalizePath(serveConfig) !== input.ngDocConfig) {
    return shared(
      `${input.serve!.legacyName}.ngDoc.config`,
      `names \`${serveConfig}\`, another NgDoc configuration than the build target's.`,
    );
  }
  const source = input.ngDocConfig;
  // Next to the project's configuration, or in the project folder when that configuration lies
  // outside it (shared by several projects, which each get their own legacy configuration).
  const configFile =
    source && (!project.root || within(posix.dirname(source), project.root))
      ? legacyName(source, '.ts')
      : posix.join(project.root, 'ng-doc.config.legacy.ts');
  if (!create(configFile, legacyConfigText(source, configFile))) {
    return shared(configFile, 'already exists.');
  }

  // tsconfig files: one per `tsConfig` value of the build target, each extending the original.
  const tsConfigs: Array<{ path: string[]; value: string }> = [];
  if (typeof build.options?.['tsConfig'] === 'string') {
    tsConfigs.push({ path: ['options', 'tsConfig'], value: build.options['tsConfig'] });
  }
  for (const [name, configuration] of Object.entries(build.configurations ?? {})) {
    if (typeof configuration?.['tsConfig'] === 'string') {
      tsConfigs.push({
        path: ['configurations', name, 'tsConfig'],
        value: configuration['tsConfig'],
      });
    }
  }
  if (!tsConfigs.length) {
    return shared(`${input.build.legacyName}.tsConfig`, 'is not set.');
  }
  for (const { path, value } of tsConfigs) {
    const file = nx(value);
    const compiler = readCompilerPaths(tree, file);
    const paths = compiler && legacyPaths(compiler, posix.dirname(file), legacyOutput, folder);
    if (!paths) {
      return shared(
        `${input.build.legacyName}.tsConfig`,
        `\`${file}\` maps no path into \`${legacyOutput}\`, so the schematic can't point ` +
          '`@ng-doc/generated` of the legacy targets at another folder.',
      );
    }
    const legacyFile = legacyName(file, '.json');
    if (!create(legacyFile, legacyTsconfigText(posix.basename(file), paths))) {
      return shared(legacyFile, 'already exists.');
    }
    edit(input.build.legacyName, path, value, legacyName(value, '.json'));
  }

  // The generated assets entry, in the options and in every configuration that sets `assets`.
  const assetsOf = (path: string[], value: JsonLike | undefined) => {
    if (!Array.isArray(value)) return;
    let moved = false;
    const next = value.map((entry) => {
      if (!isRecord(entry) || typeof entry['input'] !== 'string') return entry;
      const input = nx(entry['input']);
      if (!within(input, legacyOutput)) return entry;
      moved = true;
      return { ...entry, input: posix.join(folder, posix.relative(legacyOutput, input)) };
    });
    if (moved) edit(input.build.legacyName, path, value, next);
  };
  assetsOf(['options', 'assets'], build.options?.['assets']);
  for (const [name, configuration] of Object.entries(build.configurations ?? {})) {
    assetsOf(['configurations', name, 'assets'], configuration?.['assets']);
  }

  // Both legacy builders load the configuration named in their own options.
  const withConfig = (name: string, target: WorkspaceTarget) => {
    if (!target.options) {
      edit(name, ['options'], undefined, { ngDoc: { config: configFile } });
      return;
    }
    const ngDoc = isRecord(target.options['ngDoc']) ? target.options['ngDoc'] : undefined;
    edit(name, ['options', 'ngDoc'], ngDoc, { ...(ngDoc ?? {}), config: configFile });
  };
  withConfig(input.build.legacyName, build);
  if (serve && input.serve) withConfig(input.serve.legacyName, serve);
  for (const [legacy, target] of [
    [input.build.legacyName, build],
    ...(serve && input.serve ? [[input.serve.legacyName, serve] as const] : []),
  ] as const) {
    for (const [name, configuration] of Object.entries(target.configurations ?? {})) {
      if (configuration?.['ngDoc'] === undefined) continue;
      findings.push({
        level: 'manual',
        subject: `${legacy}.configurations.${name}.ngDoc`,
        message:
          `replaces the NgDoc configuration of the legacy targets. Set \`outDir: '${LEGACY_OUT_DIR}'\` ` +
          `in it, so that configuration writes \`${folder}\` too.`,
      });
    }
  }
  return { folder, files, edits, findings };
}

function valueAt(target: WorkspaceTarget, path: string[]): JsonLike | undefined {
  let current: JsonLike | undefined = target as JsonLike;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

function withValue(
  target: WorkspaceTarget,
  path: string[],
  value: JsonLike | undefined,
): WorkspaceTarget {
  const set = (record: JsonRecord, [key, ...rest]: string[]): JsonRecord => {
    const next: JsonRecord = { ...record };
    if (rest.length) {
      next[key] = set(isRecord(record[key]) ? (record[key] as JsonRecord) : {}, rest);
    } else if (value === undefined) {
      delete next[key];
    } else {
      next[key] = value;
    }
    return next;
  };
  return set(target, path) as WorkspaceTarget;
}

/**
 * Applies the edits of one legacy target.
 * @param target - The target.
 * @param name - The name the target is kept under.
 * @param edits - Every edit of the migration.
 */
export function applyLegacyEdits(
  target: WorkspaceTarget,
  name: string,
  edits: readonly LegacyTargetEdit[],
): WorkspaceTarget {
  return edits
    .filter((item) => item.target === name)
    .reduce((current, item) => withValue(current, item.path, item.after), target);
}

/**
 * Changes back the edits of one legacy target whose value is still the one the migration wrote.
 * @param target - The target.
 * @param name - The name the target is kept under.
 * @param edits - Every edit of the migration.
 * @returns The target, and the paths of the values that were changed since and are kept.
 */
export function undoLegacyEdits(
  target: WorkspaceTarget,
  name: string,
  edits: readonly LegacyTargetEdit[],
): { target: WorkspaceTarget; kept: string[] } {
  const kept: string[] = [];
  let current = target;
  for (const item of edits.filter((edit) => edit.target === name)) {
    if (JSON.stringify(valueAt(current, item.path)) !== JSON.stringify(item.after)) {
      kept.push(`${name}.${item.path.join('.')}`);
      continue;
    }
    current = withValue(current, item.path, item.before);
  }
  return { target: current, kept };
}
