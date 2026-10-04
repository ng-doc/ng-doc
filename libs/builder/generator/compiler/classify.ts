import { statSync } from 'node:fs';

import type { EntryDescriptor, FileChange, KeywordExport } from '../contracts';
import {
  type UnitIndex,
  indexEntry,
  keywordBindingDigests,
  normalizePath,
} from '../graph/unit-index';

/**
 * The change classifier and the affected closure of the targeted rebuild. Pure functions over a
 * committed build's {@link UnitIndex}: the targeted path (`./targeted`) goes FULL on anything they
 * do not classify as content, an evaluated entry input, a program input or a structural change it
 * can scope (see {@link classifyChanges}), and `verify` checks their closure against the full
 * generation.
 */

export type ChangeClass =
  | 'config-toolchain'
  | 'structural'
  | 'entry'
  | 'semantic'
  | 'content'
  | 'unknown';

export interface PathClassification {
  path: string;
  /** The event kind as reported; ignored by the classification (see `classifyPath`). */
  kind: FileChange['kind'];
  class: ChangeClass;
  detail: string;
  /** An `entry` or `semantic` path that is an input of the TypeScript program. */
  program?: true;
  /**
   * A structural (or unknown) path the structural class may scope: it moves the entry set, a
   * discovery or program glob, or the program's file set, which a targeted generation observes
   * again in full (discovery, the program's root membership, the entry diff), never a
   * content-level glob. An unknown path must be read by the generation's fresh discovery, program
   * or rebuilt units (`PathPass.unknown`).
   */
  scoped?: true;
}

export interface PathPass {
  classes: PathClassification[];
  /** Why the generation must be FULL, or undefined when every path may be targeted. */
  full?: string;
  /**
   * Set when the candidates exceed the dirty threshold. A performance rule, not a correctness
   * one: a targeted generation that large would cost about as much as a full one, so it runs in
   * full; the dry run still checks the closure.
   */
  threshold?: string;
  /** Candidate units (owner IDs) and descriptor/IR IDs. */
  units: Set<string>;
  descriptors: Set<string>;
  /**
   * Unknown paths a targeted attempt takes (the structural class): each must be read by this
   * generation's discovery, its program or a unit it rebuilds, or the generation runs FULL.
   */
  unknown: string[];
  /**
   * Whether a generation may keep its keyword loaders' last results instead of running them:
   * the preconditions hold and every path may be targeted (no path is config/toolchain,
   * structural or unknown). The loaders and the files they import are configuration inputs, so a
   * targeted path never reaches them; and a generation that then publishes anything but a targeted
   * result runs discovery again without the pin. It must be decided before discovery runs
   * (discovery invokes the loaders), which is why it comes from the path pass and not from the
   * later equality check (`TargetedGeneration.pin`).
   */
  pin: boolean;
}

/** What the path pass may send down the targeted path besides content edits. */
export interface PathPassOptions {
  /**
   * Program inputs (`semantic` paths, and `entry` paths the program also reads), and the
   * structural class (`PathClassification.scoped`, which changes the program's root membership):
   * only a generation whose units record semantic closures can refresh a replayed unit's program
   * facts, so without them such a change goes FULL here rather than after discovery.
   */
  program: boolean;
}

/** A tsconfig/jsconfig or package manifest (`semantic-service.ts` `PROGRAM_CONFIGURATION`). */
const PROGRAM_CONFIGURATION = /(^|\/)(package\.json|[tj]sconfig[^/]*\.json)$/;

/**
 * The dirty threshold: above it a targeted generation would not pay off. The unit share applies
 * only beyond a small floor: on a small site a full generation costs little either way, and a
 * shared include there reaches a large share of the units.
 */
export const DIRTY_UNIT_SHARE = 0.2;
export const DIRTY_UNIT_FLOOR = 8;
export const DIRTY_DESCRIPTORS = 200;

/** Whether `units` candidates of `owners` units with `descriptors` descriptors exceed the threshold. */
export function dirty(units: number, owners: number, descriptors: number): boolean {
  return (
    units > Math.max(owners * DIRTY_UNIT_SHARE, DIRTY_UNIT_FLOOR) || descriptors > DIRTY_DESCRIPTORS
  );
}

type Kind = 'file' | 'directory' | 'missing';

function currentKind(file: string): Kind {
  try {
    const stat = statSync(file);
    return stat.isFile() ? 'file' : stat.isDirectory() ? 'directory' : 'missing';
  } catch {
    return 'missing';
  }
}

/**
 * Classifies one changed path by the current state of the filesystem, never by the event kind:
 * an atomic save (an editor's safe write, a backup rename) may report `delete` and `create` of one
 * path in different batches, and the `delete` of a file that exists again is an ordinary edit.
 * A path may have several roles (a page module is usually a program input too). First match wins:
 *
 * 1. config/toolchain: a program configuration file; a path with the configuration, header
 *    template or structural output template role;
 * 2. entry: a description module, or an input of an entry's evaluated closure, that still exists
 *    and moves no discovery, content-level or program glob (discovery evaluates it again, and the
 *    fresh-discovery check decides which entries changed);
 * 3. structural: a description module or an evaluated entry input that no longer exists, a
 *    discovery or content-level glob whose membership changed, an ancestor directory of a
 *    recorded path, a guide's markdown file that no longer exists;
 * 4. semantic: a program input, or a program glob whose membership changed;
 * 5. content: a path a unit recorded (descriptor, unit or observed level);
 * 6. unknown: anything else.
 *
 * Every structural path but a content-level glob change, a program glob change, a program input
 * that no longer exists, and an unknown path are `scoped`: the structural class takes them.
 */
export function classifyPath(index: UnitIndex, change: FileChange): PathClassification {
  const file = normalizePath(change.path);
  const roles = index.roles(file);
  const program = roles.has('program');
  const result = (
    value: ChangeClass,
    detail: string,
    scoped: boolean = false,
  ): PathClassification => ({
    path: file,
    kind: change.kind,
    class: value,
    detail,
    ...(program && (value === 'entry' || value === 'semantic') ? { program } : {}),
    ...(scoped ? { scoped } : {}),
  });
  // A discovery glob is observed again by every generation; a content-level glob only by the
  // units that recorded it, which a targeted generation may replay.
  const discoveryOnly = () => index.contentGlobChange({ ...change, path: file }) === undefined;
  const kind = currentKind(file);
  if (PROGRAM_CONFIGURATION.test(file)) return result('config-toolchain', 'program configuration');
  const setting = (['configuration', 'header-template', 'output-template'] as const).find((role) =>
    roles.has(role),
  );
  if (setting) return result('config-toolchain', setting);
  const entry = roles.has('entry-module') || roles.has('entry-input');
  // An existing entry path may still move a glob's membership: discovery records the absent
  // resolution candidates of a module as entry inputs, and a file created at one of them can also
  // join a discovery or an API scope glob, which only a full generation reads again.
  const glob =
    entry && kind === 'file' ? index.structuralGlobChange({ ...change, path: file }) : undefined;
  if (glob) return result('structural', glob, discoveryOnly());
  const programGlob =
    entry && kind === 'file' ? index.programGlobChange({ ...change, path: file }) : undefined;
  if (programGlob) return result('semantic', programGlob, true);
  if (roles.has('entry-module'))
    return kind === 'file'
      ? result('entry', 'evaluated description module')
      : result('structural', 'description module no longer exists', true);
  if (roles.has('entry-input'))
    return kind === 'file'
      ? result('entry', 'evaluated entry input')
      : result('structural', 'evaluated entry input no longer exists', true);
  const structuralGlob = index.structuralGlobChange({ ...change, path: file });
  if (structuralGlob) return result('structural', structuralGlob, discoveryOnly());
  if (index.isAncestor(file) && index.hits(file).length === 0)
    return result('structural', 'ancestor directory of a recorded path', true);
  const markdown = index.markdown(file);
  if (markdown && kind !== 'file')
    return result('structural', 'observed markdown no longer exists', true);
  const programGlobChange = index.programGlobChange({ ...change, path: file });
  if (programGlobChange) return result('semantic', programGlobChange, true);
  if (program)
    return kind === 'file'
      ? result('semantic', 'program input')
      : result('semantic', 'program input no longer exists', true);
  const hits = index.hits(file);
  if (hits.length) {
    const levels = [...new Set(hits.map((hit) => hit.level))].sort().join('+');
    return result('content', `${levels} (${kind === 'missing' ? 'absent' : 'present'})`);
  }
  return result('unknown', 'not recorded by the committed build', true);
}

/**
 * Why a classified path sends the generation FULL, or undefined when it may be targeted: content,
 * an evaluated entry input (its entries are found by the fresh-discovery check), and, when
 * `options.program` allows program edits, an existing program input and every `scoped` structural
 * path (the entry diff, the program's root change and the API enumeration diff observe them
 * again).
 */
function fullReason(item: PathClassification, options: PathPassOptions): string | undefined {
  const targetable =
    item.class === 'content' ||
    (item.class === 'entry' && (!item.program || options.program)) ||
    (item.class === 'semantic' && options.program && item.detail === 'program input') ||
    (options.program && item.scoped === true);
  return targetable ? undefined : `${item.class}: ${item.detail} (${item.path})`;
}

/**
 * The path pass: classifies every changed path, then applies the dirty threshold to the
 * candidates. The candidates are the units that recorded a changed path; the targeted path adds,
 * after discovery and the program synchronization, every entry whose descriptor or evaluated value
 * changed (or that was added), every unit whose semantic closure changed, and every API
 * declaration whose enumeration changed. `precondition` is the first failed precondition, if any;
 * the paths are still classified for the record.
 */
export function classifyChanges(
  index: UnitIndex,
  changes: FileChange[],
  precondition?: string,
  options: PathPassOptions = { program: false },
): PathPass {
  const classes = changes.map((change) => classifyPath(index, change));
  const units = new Set<string>();
  const descriptors = new Set<string>();
  for (const item of classes) {
    if (fullReason(item, options) !== undefined) continue;
    for (const hit of index.hits(item.path)) {
      units.add(hit.owner);
      // A unit-level input (an entry, entry-doc or describeGuide read) or observed markdown
      // changes the owner input digest, so every descriptor of the unit is a candidate.
      const ids =
        hit.level === 'descriptor' ? hit.ids : index.owners.get(hit.owner)?.descriptors ?? [];
      ids.forEach((id) => descriptors.add(id));
    }
  }
  let full = precondition;
  for (const item of classes) full ??= fullReason(item, options);
  // An unknown path can only be read by what a generation observes again: an entry, a program
  // input or the file set that moved. Without such a change nothing can read it, so the
  // generation runs FULL before discovery (with its keyword loaders evaluated).
  const unknown = classes.find((item) => item.class === 'unknown');
  if (
    unknown &&
    !classes.some(
      (item) => item.class === 'entry' || item.class === 'semantic' || item.class === 'structural',
    )
  )
    full ??= `${unknown.class}: ${unknown.detail} (${unknown.path})`;
  const pin = full === undefined;
  const threshold = dirty(units.size, index.owners.size, descriptors.size)
    ? `dirty threshold: ${units.size} of ${index.owners.size} units, ${descriptors.size} descriptors`
    : undefined;
  return {
    classes,
    ...(full !== undefined ? { full } : {}),
    ...(threshold !== undefined ? { threshold } : {}),
    units,
    descriptors,
    unknown: classes.filter((item) => item.class === 'unknown').map((item) => item.path),
    pin,
  };
}

/** What the generation's own (fresh) discovery and keyword set say, for the closure. */
export interface FreshBuild {
  configurationDigest: string;
  entries: EntryDescriptor[];
  keywords: KeywordExport[];
}

export interface Closure {
  /** Set when the fresh-discovery equality check fails: the generation is FULL. */
  full?: string;
  /** Entries whose descriptor or evaluated value changed (their units are candidates). */
  entries: Set<string>;
  /** The keyword diff K: keys whose binding changed, appeared or disappeared. */
  keys: string[];
  /** One-hop consumers of K that are not candidates themselves. */
  consumers: Set<string>;
  /** Candidates ∪ consumers: the units the targeted path would re-describe, render or relink. */
  units: Set<string>;
}

/** What the fresh-discovery equality check found: a FULL reason, or the entries that changed. */
export interface DiscoveryChanges {
  full?: string;
  /** Entries whose descriptor (any field, its dependencies included) differs from the base's. */
  entries: Set<string>;
  /** With `structural`: entries of the fresh discovery the base has no entry for. */
  added: Set<string>;
  /** With `structural`: entries of the base the fresh discovery no longer has. */
  removed: Set<string>;
}

/**
 * The fresh-discovery equality check: the configuration digest and the entry set must equal the
 * retained ones, and every entry must keep its kind. An entry whose descriptor differs in any other
 * way (its title, route or data, its markdown files and their digests, the inputs of its evaluated
 * closure, its evaluated value) is reported as changed: its units are described again, and every
 * other unit replays exactly what the full path would build for it, since a unit's describe,
 * render and assembly read no other entry's descriptor (the site-wide outputs, which do, are
 * aggregated in full). This also covers what no event reported, for example a file a page module
 * reads through a computed `require`. The live guide values `describeGuide` reads (playground
 * controls from the evaluated page) are compared by the targeted path itself.
 *
 * With `structural` (the structural class) the entry set may differ: an entry the base does not
 * have is `added`, one the fresh discovery no longer has is `removed`, and an entry whose kind
 * changed is changed (its units change identity: the old ones are removed, the new ones added).
 * Breadcrumbs, routes and parents are descriptor fields, so a moved page and the descendants of an
 * edited category are changed entries.
 */
export function discoveryChanges(
  index: UnitIndex,
  fresh: Pick<FreshBuild, 'configurationDigest' | 'entries'>,
  structural: boolean = false,
): DiscoveryChanges {
  const entries = new Set<string>();
  const added = new Set<string>();
  const removed = new Set<string>();
  const result = (full?: string): DiscoveryChanges => ({
    ...(full !== undefined ? { full } : {}),
    entries,
    added,
    removed,
  });
  if (fresh.configurationDigest !== index.configurationDigest)
    return result('configuration digest changed');
  if (!structural && fresh.entries.length !== index.entries.size)
    return result('entry set changed');
  for (const entry of fresh.entries) {
    const retained = index.entries.get(entry.id);
    if (!retained) {
      if (!structural) return result(`entry added: ${entry.id}`);
      added.add(entry.id);
      continue;
    }
    if (retained.kind !== entry.kind) {
      if (!structural) return result(`entry kind changed: ${entry.id}`);
      entries.add(entry.id);
      continue;
    }
    const current = indexEntry(entry);
    if (
      current.masked !== retained.masked ||
      current.evaluated !== retained.evaluated ||
      current.markdown.size !== retained.markdown.size ||
      [...current.markdown].some(([file, digest]) => retained.markdown.get(file) !== digest)
    )
      entries.add(entry.id);
  }
  const ids = new Set(fresh.entries.map((entry) => entry.id));
  for (const id of index.entries.keys()) if (!ids.has(id)) removed.add(id);
  return result();
}

/** The keys whose binding differs between the retained and the fresh keyword set (K). */
export function keywordDiff(index: UnitIndex, keywords: KeywordExport[]): string[] {
  const fresh = keywordBindingDigests(keywords);
  const keys = new Set<string>();
  for (const [key, digest] of fresh) if (index.bindings.get(key) !== digest) keys.add(key);
  for (const key of index.bindings.keys()) if (!fresh.has(key)) keys.add(key);
  return [...keys].sort();
}

/**
 * The affected closure of a targeted generation: the path pass's candidates and the units of every
 * changed entry, plus the one-hop consumers of K. One hop is enough because exports come only from
 * entries and IR, which relinking does not change.
 */
export function affectedClosure(index: UnitIndex, pass: PathPass, fresh: FreshBuild): Closure {
  const discovery = discoveryChanges(index, fresh);
  const candidates = new Set(pass.units);
  for (const owner of index.owners.values())
    if (discovery.entries.has(owner.entryId)) candidates.add(owner.id);
  const keys = keywordDiff(index, fresh.keywords);
  const consumers = new Set([...index.consumersOf(keys)].filter((id) => !candidates.has(id)));
  return {
    ...(discovery.full ? { full: `discovery: ${discovery.full}` } : {}),
    entries: discovery.entries,
    keys,
    consumers,
    units: new Set([...candidates, ...consumers]),
  };
}
