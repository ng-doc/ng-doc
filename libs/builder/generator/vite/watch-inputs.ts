import { Minimatch } from 'minimatch';
import { access } from 'node:fs/promises';
import path from 'node:path';

import { compareText } from '../../helpers/text-order';
import type { BuildResult, FileChange, WatchInputs } from '../contracts';

function normalize(value: string): string {
  return path.resolve(value).replace(/\\/g, '/');
}

function union(left?: WatchInputs, right?: WatchInputs): WatchInputs {
  const files = new Set([...(left?.files ?? []), ...(right?.files ?? [])].map(normalize));
  const globs = new Map<string, WatchInputs['globs'][number]>();
  for (const glob of [...(left?.globs ?? []), ...(right?.globs ?? [])]) {
    const value = {
      root: normalize(glob.root),
      include: [...new Set(glob.include)].sort(),
      exclude: [...new Set(glob.exclude)].sort(),
    };
    globs.set(JSON.stringify(value), value);
  }
  return {
    files: [...files].sort(),
    globs: [...globs.values()].sort((a, b) => compareText(JSON.stringify(a), JSON.stringify(b))),
  };
}

function inputKey(inputs: WatchInputs): string {
  return JSON.stringify(inputs);
}

function absolutePattern(root: string, pattern: string): string {
  return normalize(path.isAbsolute(pattern) ? pattern : path.join(root, pattern));
}

function patternBase(root: string, pattern: string): string {
  const absolute = absolutePattern(root, pattern);
  const magic = absolute.search(/[*?{}[\]()!]/);
  if (magic < 0) return path.dirname(absolute).replace(/\\/g, '/');
  const slash = absolute.lastIndexOf('/', magic);
  return (slash > 0 ? absolute.slice(0, slash) : path.parse(absolute).root).replace(/\\/g, '/');
}

async function nearestExisting(value: string): Promise<string> {
  let cursor = normalize(value);
  for (;;) {
    try {
      await access(cursor);
      return cursor;
    } catch {
      const parent = path.dirname(cursor).replace(/\\/g, '/');
      if (parent === cursor) return cursor;
      cursor = parent;
    }
  }
}

function ancestorOf(target: string, candidate: string): boolean {
  return target === candidate || target.startsWith(`${candidate}/`);
}

/**
 * On POSIX a backslash in a glob is an escape (for example `\\(auth\\)`), so it must reach minimatch
 * unchanged; only Windows patterns use it as a separator.
 */
function globPattern(pattern: string): string {
  return path.sep === '\\' ? pattern.replace(/\\/g, '/') : pattern;
}

interface CompiledPattern {
  absolute: boolean;
  matcher: Minimatch;
}

interface CompiledGlob {
  root: string;
  include: CompiledPattern[];
  exclude: CompiledPattern[];
}

function compilePattern(pattern: string): CompiledPattern {
  return {
    absolute: path.isAbsolute(pattern),
    matcher: new Minimatch(globPattern(pattern), { dot: true }),
  };
}

function patternMatches(glob: CompiledGlob, pattern: CompiledPattern, changed: string): boolean {
  const subject = pattern.absolute
    ? changed
    : path.relative(glob.root, changed).replace(/\\/g, '/');
  return pattern.matcher.match(subject);
}

function globMatches(glob: CompiledGlob, changed: string): boolean {
  return (
    glob.include.some((pattern) => patternMatches(glob, pattern, changed)) &&
    !glob.exclude.some((pattern) => patternMatches(glob, pattern, changed))
  );
}

/**
 * Every directory above `target` that `ancestorOf(target, directory)` accepts: a filesystem root
 * `/` or `C:/` is never one, because `${root}/` would contain a doubled separator.
 */
function addAncestors(target: string, into: Set<string>): void {
  let cursor = target;
  for (;;) {
    const slash = cursor.lastIndexOf('/');
    if (slash <= 0) return;
    cursor = cursor.slice(0, slash);
    if (into.has(cursor)) return;
    into.add(cursor);
  }
}

/**
 * Lookup structures for the effective inputs, built once per change of the inputs so that each
 * `matches`/`covers` costs O(path depth + globs) instead of O(recorded files).
 */
class InputIndex {
  /** Recorded files and glob bases. */
  readonly targets = new Set<string>();
  /** Every strict ancestor directory of a recorded file or glob base. */
  readonly ancestors = new Set<string>();
  readonly bases: string[] = [];
  readonly globs: CompiledGlob[];

  constructor(inputs: WatchInputs) {
    for (const file of inputs.files) {
      this.targets.add(file);
      addAncestors(file, this.ancestors);
    }
    const bases = new Set<string>();
    for (const glob of inputs.globs) {
      for (const include of glob.include) bases.add(patternBase(glob.root, include));
    }
    for (const base of bases) {
      this.targets.add(base);
      addAncestors(base, this.ancestors);
      this.bases.push(base);
    }
    this.globs = inputs.globs.map((glob) => ({
      root: glob.root,
      include: glob.include.map(compilePattern),
      exclude: glob.exclude.map(compilePattern),
    }));
  }
}

export class WatchInputRegistry {
  private success?: WatchInputs;
  private failure?: WatchInputs;
  private effective: WatchInputs = { files: [], globs: [] };
  private index = new InputIndex(this.effective);
  private newestGeneration = -1;
  private readonly physical = new Set<string>();

  constructor(private readonly capacity: number) {}

  started(generation: number): void {
    this.newestGeneration = Math.max(this.newestGeneration, generation);
  }

  isCurrent(generation: number): boolean {
    return generation >= this.newestGeneration;
  }

  /**
   * `directories` lists the physical targets added for glob bases (existing directories); every
   * other added target is a recorded file, present or missing.
   */
  async observe(result: BuildResult): Promise<{
    changed: boolean;
    physicalAdded: string[];
    directories: string[];
    accepted: boolean;
  }> {
    if (result.status === 'cancelled' || result.generation < this.newestGeneration) {
      return { changed: false, physicalAdded: [], directories: [], accepted: false };
    }
    this.newestGeneration = result.generation;
    let success = this.success;
    let failure = this.failure;
    if (result.status === 'success' && result.watchInputs) {
      success = structuredClone(result.watchInputs);
      failure = undefined;
    } else if (result.status === 'failure' && result.watchInputs) {
      failure = structuredClone(result.watchInputs);
    } else {
      return { changed: false, physicalAdded: [], directories: [], accepted: true };
    }
    const next = union(success, failure);
    const changed = inputKey(next) !== inputKey(this.effective);
    const desired = new Set(next.files);
    const globBases = new Set<string>();
    for (const glob of next.globs) {
      for (const include of glob.include) globBases.add(patternBase(glob.root, include));
    }
    const additions = new Set<string>();
    const directories = new Set<string>();
    for (const target of globBases) {
      const existing = await nearestExisting(target);
      if (existing === path.parse(existing).root.replace(/\\/g, '/')) {
        throw new Error(
          `[NGDOC_VITE_WATCH_ROOT] Refusing an unbounded filesystem-root glob watch for ${target}.`,
        );
      }
      if (!this.physical.has(existing)) {
        additions.add(existing);
        directories.add(existing);
      }
    }
    for (const target of desired) {
      if (target === path.parse(target).root.replace(/\\/g, '/')) {
        throw new Error(
          `[NGDOC_VITE_WATCH_ROOT] Refusing an unbounded filesystem-root file watch for ${target}.`,
        );
      }
      if (!this.physical.has(target)) additions.add(target);
    }
    if (result.generation < this.newestGeneration) {
      return { changed: false, physicalAdded: [], directories: [], accepted: false };
    }
    const physicalAdded = [...additions].sort();
    if (this.physical.size + physicalAdded.length > this.capacity) {
      throw new Error(
        `[NGDOC_VITE_WATCH_CAPACITY] Required ${this.physical.size + physicalAdded.length} physical watch targets; configured maximum is ${this.capacity}.`,
      );
    }
    this.success = success;
    this.failure = failure;
    this.effective = next;
    if (changed) this.index = new InputIndex(next);
    return { changed, physicalAdded, directories: [...directories].sort(), accepted: true };
  }

  /**
   * A change matches a recorded file or glob base, an ancestor directory of one, or a glob member
   * that is not excluded.
   */
  matches(change: FileChange): boolean {
    const changed = normalize(change.path);
    const index = this.index;
    if (index.targets.has(changed) || index.ancestors.has(changed)) return true;
    return index.globs.some((glob) => globMatches(glob, changed));
  }

  /**
   * True when a watcher problem at `target` can hide a change to a recorded input: the target
   * matches like a change would, or lies below a glob base (a directory whose members can become
   * inputs, whose own events do not match until a member does).
   */
  covers(target: string): boolean {
    const changed = normalize(target);
    return this.matches({ kind: 'update', path: changed }) || this.underGlobBase(changed);
  }

  /** True when `target` lies at or below a recorded glob base (a watched input directory). */
  underGlobBase(target: string): boolean {
    const changed = normalize(target);
    return this.index.bases.some((base) => ancestorOf(changed, base));
  }

  snapshot(): WatchInputs {
    return structuredClone(this.effective);
  }

  physicalCount(): number {
    return this.physical.size;
  }

  confirmPhysical(targets: readonly string[]): void {
    targets.forEach((target) => this.physical.add(normalize(target)));
  }
}
