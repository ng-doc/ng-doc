import fg from 'fast-glob';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, posix, resolve } from 'node:path';
import { Project, ts } from 'ts-morph';

import type { DiscoverySnapshot } from '../contracts';
import { type TrackedFiles, normalize, SemanticFailure } from './dependencies';
import { ownedRootReach, OwnedRoots } from './owned-roots';
import { tsconfigMembershipDependencies } from './program-inputs';
import type { ProgramObservations } from './program-observations';

/**
 * The program lifecycle: builds the TypeScript Project of a discovery snapshot and records every
 * observation it depends on. Per-importer tracking lives in `program-observations.ts`, retention
 * in `program-retention.ts`.
 */

export function ownedOverlap(kind: string, path: string, owned: OwnedRoots): SemanticFailure {
  return new SemanticFailure(
    'SEMANTIC_OWNED_ROOT_OVERLAP',
    `${kind} ${path} lies under a generator-owned output or cache root (${owned.describe(path)}). ` +
      'Generated output is never documented; configure outputRoot/cacheRoot outside documented sources.',
    { path },
  );
}

/**
 * The formatter configuration files probed in the workspace root and each of its ancestors:
 * formatting helpers receive the workspace explicitly, so their configuration is a program input.
 */
export const FORMATTER_CONFIGURATION_FILES: readonly string[] = [
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.js',
  '.prettierrc.cjs',
  '.prettierrc.mjs',
  '.prettierrc.ts',
  '.prettierrc.cts',
  '.prettierrc.mts',
  '.prettierrc.yaml',
  '.prettierrc.yml',
  '.prettierrc.json5',
  '.prettierrc.toml',
  'prettier.config.js',
  'prettier.config.cjs',
  'prettier.config.mjs',
  'prettier.config.ts',
  'prettier.config.cts',
  'prettier.config.mts',
  '.editorconfig',
  'package.json',
];

/** Records the existence (and the content, when present) of every formatter configuration file. */
export function trackFormatterConfiguration(workspaceRoot: string, files: TrackedFiles): void {
  for (let directory = workspaceRoot; ; directory = dirname(directory)) {
    for (const name of FORMATTER_CONFIGURATION_FILES) {
      const path = normalize(resolve(directory, name));
      files.add({ kind: 'existence', path, exists: existsSync(path) });
      if (existsSync(path)) files.read(path);
    }
    if (dirname(directory) === directory) break;
  }
}

/** A built program: its Project, the members of each API scope, and the owned-root view. */
export interface BuiltProgram {
  project: Project;
  /** `${entryId}:${scopeId}` → the sorted scope matches. */
  scopes: Map<string, string[]>;
  owned: OwnedRoots;
  /** The root names of the built program (see `ProgramMirror.roots`). */
  roots: readonly string[];
}

/** The root membership of a discovery snapshot's program (see {@link programMembers}). */
export interface ProgramMembers {
  parsed: ts.ParsedCommandLine;
  owned: OwnedRoots;
  /** `${entryId}:${scopeId}` → the sorted scope matches. */
  scopes: Map<string, string[]>;
  /** The files the Project is built from, in the order they are handed to ts-morph. */
  members: string[];
}

/**
 * The root membership of a discovery snapshot's program, recorded into `files` exactly as a FULL
 * synchronization records it: the tsconfig reads, each entry's module and API scope glob, and the
 * tsconfig membership. A root change of a retained program (`program-retention.ts`) records the
 * same observations again with this function. Throws a `SemanticFailure`.
 */
export async function programMembers(
  discovery: DiscoverySnapshot,
  files: TrackedFiles,
): Promise<ProgramMembers> {
  const { configuration: config, entries } = discovery;
  const host: ts.ParseConfigFileHost = {
    ...ts.sys,
    readFile: (file) => {
      try {
        return files.read(file);
      } catch {
        return undefined;
      }
    },
    onUnRecoverableConfigFileDiagnostic: (error) => {
      throw new SemanticFailure(
        'SEMANTIC_CONFIG',
        ts.flattenDiagnosticMessageText(error.messageText, '\n'),
        { path: config.tsConfig },
      );
    },
  };
  // TypeScript asserts that a JSON file's diagnostics name the file in its own spelling (forward
  // slashes): a Windows path with backslashes fails that Debug assertion on a syntax error instead
  // of reporting the error.
  const parsed = ts.getParsedCommandLineOfConfigFile(normalize(config.tsConfig), {}, host);
  if (!parsed || parsed.errors.length)
    throw new SemanticFailure(
      'SEMANTIC_CONFIG',
      parsed?.errors
        .map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n'))
        .join('\n') ?? 'Cannot parse tsconfig',
      { path: config.tsConfig },
    );
  // Generator output and cache are never semantic inputs. An application that imports
  // `@ng-doc/generated` would otherwise pull the previous commit's output into this
  // program, so every commit would invalidate the next generation's semantic scope.
  const owned = new OwnedRoots([config.outputRoot, config.cacheRoot]);
  if (owned.has(config.tsConfig))
    throw ownedOverlap('TypeScript configuration', config.tsConfig, owned);
  const scopes = new Map<string, string[]>();
  const members = new Set(parsed.fileNames.filter((file) => !owned.has(file)));
  entries.forEach((entry) => {
    if (owned.has(entry.source.path))
      throw ownedOverlap('Documentation entry', entry.source.path, owned);
    files.read(entry.source.path);
    members.add(entry.source.path);
    if (entry.kind === 'api')
      entry.scopes.forEach((scope) => {
        const reach = ownedRootReach(config.workspaceRoot, scope.include, scope.exclude, config);
        if (reach)
          throw new SemanticFailure(
            'SEMANTIC_OWNED_ROOT_OVERLAP',
            `API scope "${scope.name}" include pattern "${reach.pattern}" can match files under the generator-owned root ${reach.root}. ` +
              `Narrow the pattern or add "${posix.relative(normalize(config.workspaceRoot), reach.root)}/**" to the scope exclude.`,
            { path: entry.source.path },
          );
        const matches = fg
          .sync(scope.include, {
            cwd: config.workspaceRoot,
            ignore: scope.exclude,
            absolute: true,
            dot: true,
            onlyFiles: true,
          })
          .map(normalize)
          .sort();
        const hidden = matches.find((file) => owned.has(file));
        if (hidden) throw ownedOverlap(`API scope "${scope.name}" match`, hidden, owned);
        scopes.set(`${entry.id}:${scope.id}`, matches);
        files.add({
          kind: 'glob',
          root: config.workspaceRoot,
          include: scope.include,
          exclude: scope.exclude,
          members: matches,
        });
        matches.forEach((file) => members.add(file));
      });
  });
  // Record how the tsconfig selected its root files so a re-scan reproduces it exactly.
  // Entries and API scope matches carry their own content and glob observations.
  (await tsconfigMembershipDependencies(parsed, config.tsConfig, owned)).forEach((dependency) =>
    files.add(dependency),
  );
  return { parsed, owned, scopes, members: [...members] };
}

/**
 * Builds the program of a discovery snapshot into `observations`: the tsconfig, the entries and API
 * scopes (global), every program file (per importer), the formatter configuration (global), and
 * last the aggregate `semantic` definition. Throws a `SemanticFailure`; what was observed until
 * then stays in `observations`.
 */
export async function buildProgram(
  discovery: DiscoverySnapshot,
  observations: ProgramObservations,
): Promise<BuiltProgram> {
  const config = discovery.configuration;
  const { parsed, owned, scopes, members } = await programMembers(discovery, observations.files);
  const project = new Project({
    // TypeScript orders a union's members by type creation order unless `stableTypeOrdering`
    // is set: a page rendered on a new checker without the pages a cold build renders before it
    // would print `B | A` where the cold build prints `A | B`. With it, members are ordered by
    // kind, name, value and declaration position, and by file order (`SemanticClosures` checks
    // that the files keep their relative order).
    compilerOptions: { ...parsed.options, stableTypeOrdering: true },
    // ts-morph otherwise exposes synthetic /node_modules library paths that cannot
    // participate in real filesystem cache refresh. Use the installed TS library bytes.
    libFolderPath: dirname(createRequire(import.meta.url).resolve('typescript')),
    fileSystem: owned.fileSystem(),
  });
  project.addSourceFilesAtPaths(members);
  project.resolveSourceFileDependencies();
  observations.track(project, owned);
  const program = project.getProgram().compilerObject;
  const syntax = syntaxFailure(program);
  if (syntax) throw syntax;
  trackFormatterConfiguration(config.workspaceRoot, observations.files);
  observations.define(config, project);
  return { project, scopes, owned, roots: program.getRootFileNames() };
}

/**
 * The failure a synchronization reports for a program with syntax errors, or undefined. A patched
 * program is checked with the same function, so its diagnostic is the cold one.
 */
export function syntaxFailure(program: ts.Program): SemanticFailure | undefined {
  const syntactic = program.getSyntacticDiagnostics();
  return syntactic.length
    ? new SemanticFailure(
        'SEMANTIC_SYNTAX',
        syntactic
          .map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n'))
          .join('\n'),
      )
    : undefined;
}
