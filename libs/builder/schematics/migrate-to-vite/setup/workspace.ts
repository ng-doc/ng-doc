import { Tree } from '@angular-devkit/schematics';
import { posix } from 'path';

import { JsonFile, JsonPath } from './json-file';

/** A JSON value as it appears in `angular.json` or `project.json`. */
export type JsonLike =
  | string
  | number
  | boolean
  | null
  | JsonLike[]
  | { [key: string]: JsonLike | undefined };

/** A JSON object as it appears in `angular.json` or `project.json`. */
export interface JsonRecord {
  [key: string]: JsonLike | undefined;
}

/** One target of a project, with the key its builder is stored under (`builder` or `executor`). */
export interface WorkspaceTarget extends JsonRecord {
  builder?: string;
  executor?: string;
  options?: JsonRecord;
  configurations?: { [name: string]: JsonRecord | undefined };
  defaultConfiguration?: string;
}

/**
 * A project of an Angular CLI (`angular.json`) or Nx (`project.json`) workspace, read without the
 * devkit workspace API so that both layouts, and Nx's `executor` key, are handled the same way.
 */
export interface WorkspaceProject {
  name: string;
  /** The project root, workspace-relative and POSIX (`''` for the workspace root). */
  root: string;
  /** The source root, workspace-relative and POSIX. */
  sourceRoot: string;
  /** `angular.json` or the project's `project.json`. */
  file: string;
  /** The JSON path of the project's target map inside `file`. */
  targetsPath: string[];
  targets: { [name: string]: WorkspaceTarget | undefined };
  /** The `i18n` block of the project, if any. */
  i18n?: JsonLike;
}

function normalize(value: string | undefined): string {
  const normalized = posix.normalize((value ?? '').replace(/\\/g, '/')).replace(/^\.\/?|\/$/g, '');
  return normalized === '.' ? '' : normalized;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The builder or executor of a target. */
export function targetBuilder(target: WorkspaceTarget | undefined): string | undefined {
  return target?.builder ?? target?.executor;
}

/** The key a target stores its builder under: `builder` (angular.json) or `executor` (Nx). */
export function builderKey(target: WorkspaceTarget): 'builder' | 'executor' {
  return target.executor !== undefined && target.builder === undefined ? 'executor' : 'builder';
}

function projectFromJson(
  name: string,
  value: JsonRecord,
  file: string,
  basePath: string[],
  fallbackRoot: string,
): WorkspaceProject {
  const root = normalize(typeof value['root'] === 'string' ? value['root'] : fallbackRoot);
  const targetsKey = isRecord(value['architect']) ? 'architect' : 'targets';
  const targets = isRecord(value[targetsKey]) ? (value[targetsKey] as JsonRecord) : {};
  return {
    name,
    root,
    sourceRoot: normalize(
      typeof value['sourceRoot'] === 'string' ? value['sourceRoot'] : posix.join(root, 'src'),
    ),
    file,
    targetsPath: [...basePath, targetsKey],
    targets: targets as WorkspaceProject['targets'],
    ...(value['i18n'] === undefined ? {} : { i18n: value['i18n'] }),
  };
}

function findProjectJsonFiles(tree: Tree): string[] {
  const found: string[] = [];
  const visit = (directory: string): void => {
    const entry = tree.getDir(directory);
    for (const file of entry.subfiles) {
      if (file === 'project.json') found.push(posix.join(directory, file).replace(/^\//, ''));
    }
    for (const sub of entry.subdirs) {
      if (sub === 'node_modules' || sub.startsWith('.') || sub === 'dist') continue;
      visit(posix.join(directory, sub));
    }
  };
  visit('/');
  return found.sort();
}

/**
 * The projects of `angular.json`, or none when there is no `angular.json`.
 * @param tree - The workspace tree.
 */
function readAngularJsonProjects(tree: Tree): WorkspaceProject[] {
  if (!tree.exists('angular.json')) return [];
  const projects = new JsonFile(tree, 'angular.json').get(['projects']) as unknown;
  if (!isRecord(projects)) return [];
  return Object.entries(projects)
    .filter((entry): entry is [string, JsonRecord] => isRecord(entry[1]))
    .map(([name, value]) => projectFromJson(name, value, 'angular.json', ['projects', name], ''));
}

/**
 * The projects of the `project.json` files.
 * @param tree - The workspace tree.
 * @param namesByRoot - Project names by root, for a `project.json` without a `name`.
 */
function readProjectJsonProjects(tree: Tree, namesByRoot: Map<string, string>): WorkspaceProject[] {
  return findProjectJsonFiles(tree).flatMap((file) => {
    const value = new JsonFile(tree, file).get([]) as unknown;
    if (!isRecord(value)) return [];
    const root = posix.dirname(file) === '.' ? '' : posix.dirname(file);
    const name =
      typeof value['name'] === 'string'
        ? value['name']
        : namesByRoot.get(root) ?? posix.basename(root);
    return [projectFromJson(name, value, file, [], root)];
  });
}

/**
 * Whether the tree overwrites the `angular.json` it was given. Nx's virtual `angular.json` always
 * exists outside the tree, so an edit of it is an overwrite.
 * @param tree - The workspace tree.
 */
function changesAngularJson(tree: Tree): boolean {
  return tree.actions.some(
    (action) => action.kind === 'o' && action.path.replace(/^\//, '') === 'angular.json',
  );
}

/**
 * Reads every project of the workspace.
 *
 * - An Angular CLI workspace (no `nx.json`): the projects of `angular.json`, or of the
 *   `project.json` files when there is no `angular.json`.
 * - An Nx workspace: the `project.json` files first, then the `angular.json` projects that no
 *   `project.json` declares. Under `nx g`, Nx shows Angular devkit schematics a virtual
 *   `angular.json` built from every `project.json`, and writing it makes Nx rewrite all of them
 *   (reordered keys, its own layout, no final newline), including unrelated projects. Reading a
 *   project from its own `project.json` keeps every write in that one file, as a text edit.
 * - An Nx workspace whose `angular.json` this tree already overwrites, as the steps of `ng add`
 *   (which edit the workspace through the devkit API) do before `vite-setup`: the `angular.json`
 *   projects first. When the tree is committed, Nx writes the projects of the virtual
 *   `angular.json` over their `project.json`, so an edit of a `project.json` in the same tree is
 *   lost, and the `project.json` read here would miss the edits of `angular.json`.
 * @param tree - The workspace tree.
 */
export function readWorkspaceProjects(tree: Tree): WorkspaceProject[] {
  const angular = readAngularJsonProjects(tree);
  if (!tree.exists('nx.json')) {
    return tree.exists('angular.json') ? angular : readProjectJsonProjects(tree, new Map());
  }
  if (angular.length && changesAngularJson(tree)) {
    const names = new Set(angular.map((project) => project.name));
    return [
      ...angular,
      ...readProjectJsonProjects(tree, new Map()).filter((project) => !names.has(project.name)),
    ];
  }
  // A `project.json` without a name is named by Nx, which the virtual `angular.json` shows.
  const projects = readProjectJsonProjects(
    tree,
    new Map(angular.map((project) => [project.root, project.name])),
  );
  const names = new Set(projects.map((project) => project.name));
  const roots = new Set(projects.map((project) => project.root));
  return [
    ...projects,
    ...angular.filter((project) => !names.has(project.name) && !roots.has(project.root)),
  ];
}

/**
 * The options a target runs with for a configuration: its `options` with the configuration's
 * values over them (a shallow merge, as Architect does).
 */
export function resolveTargetOptions(
  target: WorkspaceTarget,
  configuration: string | undefined,
): JsonRecord {
  const configured = configuration ? target.configurations?.[configuration] : undefined;
  return { ...(target.options ?? {}), ...(configured ?? {}) };
}

/** Parses `project:target[:configuration]`; an empty project means the current one. */
export function parseTargetString(
  value: string,
): { project: string; target: string; configuration?: string } | undefined {
  const match = /^([^:\s]*):([^:\s]*)(?::([^\s]+))?$/.exec(value);
  if (!match) return undefined;
  return {
    project: match[1],
    target: match[2],
    ...(match[3] === undefined ? {} : { configuration: match[3] }),
  };
}

/** A target with its `buildTarget` option set, or removed (with `options` when that empties it). */
export function withBuildTarget(
  target: WorkspaceTarget,
  buildTarget: string | undefined,
): WorkspaceTarget {
  const options = { ...(target.options ?? {}) };
  if (buildTarget === undefined) delete options['buildTarget'];
  else options['buildTarget'] = buildTarget;
  const { options: _previous, ...rest } = target;
  return Object.keys(options).length ? { ...rest, options } : rest;
}

/**
 * Writes a target as a whole, replacing an existing one. A new target is inserted right after
 * the target named by `anchor`, or right before `anchor.before`, when that target exists, so a
 * renamed target stays next to its replacement.
 * @param tree - The workspace tree.
 * @param project - The project.
 * @param name - The target.
 * @param value - The target, or undefined to remove it.
 * @param anchor - The target to insert a new target after, or `{ before }` to insert it before.
 */
export function writeTarget(
  tree: Tree,
  project: WorkspaceProject,
  name: string,
  value: WorkspaceTarget | undefined,
  anchor?: string | { before: string },
): void {
  const json = new JsonFile(tree, project.file);
  const path = [...project.targetsPath, name];
  if (value === undefined) {
    json.remove(path);
    return;
  }
  const names = Object.keys((json.get(project.targetsPath) as unknown as JsonRecord) ?? {});
  const exists = names.includes(name);
  const index =
    anchor === undefined
      ? -1
      : typeof anchor === 'string'
        ? names.indexOf(anchor) + (names.includes(anchor) ? 1 : 0)
        : names.indexOf(anchor.before);
  json.modify(path, value as never, exists || index < 0 ? undefined : () => index);
}

/**
 * Applies the differences between two values as edits to the values that changed, so everything
 * else keeps its text and order. A new property is appended to its object.
 * @param json - The file.
 * @param path - The path of both values.
 * @param before - The value in the file.
 * @param after - The value to write.
 */
function applyDifferences(
  json: JsonFile,
  path: JsonPath,
  before: JsonRecord,
  after: JsonRecord,
): void {
  for (const key of Object.keys(before)) {
    if (after[key] === undefined) json.modify([...path, key], undefined);
  }
  for (const [key, value] of Object.entries(after)) {
    if (value === undefined) continue;
    const current = before[key];
    if (isRecord(current) && isRecord(value)) {
      applyDifferences(json, [...path, key], current, value);
    } else if (JSON.stringify(current) !== JSON.stringify(value)) {
      json.modify([...path, key], value, false);
    }
  }
}

/**
 * Updates an existing target to a value with the smallest text edits: only the values that differ
 * are written, so the rest of the target keeps the layout and key order of the user's file.
 * Writes the whole target when it does not exist.
 * @param tree - The workspace tree.
 * @param project - The project.
 * @param name - The target.
 * @param value - The target as it should be.
 */
export function updateTarget(
  tree: Tree,
  project: WorkspaceProject,
  name: string,
  value: WorkspaceTarget,
): void {
  const json = new JsonFile(tree, project.file);
  const path = [...project.targetsPath, name];
  const current = json.get(path);
  if (isRecord(current)) applyDifferences(json, path, current, value);
  else writeTarget(tree, project, name, value);
}

/**
 * Renames a target by rewriting its key, so the target keeps its text and its place.
 * @param tree - The workspace tree.
 * @param project - The project.
 * @param from - The current name.
 * @param to - The new name, which no target may have.
 */
export function renameTarget(
  tree: Tree,
  project: WorkspaceProject,
  from: string,
  to: string,
): void {
  new JsonFile(tree, project.file).rename([...project.targetsPath, from], to);
}
