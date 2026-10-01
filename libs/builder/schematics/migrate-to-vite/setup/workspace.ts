import { Tree } from '@angular-devkit/schematics';
import { posix } from 'path';

import { JsonFile } from './json-file';

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
 * Reads every project of the workspace: from `angular.json` when it exists, otherwise from the Nx
 * `project.json` files.
 */
export function readWorkspaceProjects(tree: Tree): WorkspaceProject[] {
  if (tree.exists('angular.json')) {
    const json = new JsonFile(tree, 'angular.json');
    const projects = json.get(['projects']) as unknown;
    if (!isRecord(projects)) return [];
    return Object.entries(projects)
      .filter((entry): entry is [string, JsonRecord] => isRecord(entry[1]))
      .map(([name, value]) => projectFromJson(name, value, 'angular.json', ['projects', name], ''));
  }
  return findProjectJsonFiles(tree).flatMap((file) => {
    const value = new JsonFile(tree, file).get([]) as unknown;
    if (!isRecord(value)) return [];
    const root = posix.dirname(file) === '.' ? '' : posix.dirname(file);
    const name = typeof value['name'] === 'string' ? value['name'] : posix.basename(root);
    return [projectFromJson(name, value, file, [], root)];
  });
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
 * Writes a target. A new target is inserted right after `after` when that target exists, so a
 * renamed target stays next to its replacement.
 */
export function writeTarget(
  tree: Tree,
  project: WorkspaceProject,
  name: string,
  value: WorkspaceTarget | undefined,
  after?: string,
): void {
  const json = new JsonFile(tree, project.file);
  const path = [...project.targetsPath, name];
  if (value === undefined) {
    json.remove(path);
    return;
  }
  const names = Object.keys((json.get(project.targetsPath) as unknown as JsonRecord) ?? {});
  const exists = names.includes(name);
  const anchor = after === undefined ? -1 : names.indexOf(after);
  json.modify(path, value as never, exists || anchor < 0 ? undefined : () => anchor + 1);
}
