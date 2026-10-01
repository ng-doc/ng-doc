import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';

import type {
  Dependency,
  EntryDescriptor,
  FileChange,
  KeywordExport,
  PageArtifact,
} from '../contracts';
import { canonicalJson, digestOf } from '../kernel/canonical';
import { changedObservation } from './index';

/**
 * The reverse index of one committed build, for the targeted rebuild's change classifier and
 * affected closure (`compiler/classify.ts`). Built from the candidate snapshot a generation
 * returned, plus the facts of the same generation the snapshot does not carry (the discovery
 * snapshot and its dependencies, the output templates, the keyword set). It does not depend on the
 * persistent reuse memo, which only exists with `cache: true`: every edge comes from artifacts,
 * descriptors, IR, discovery and keyword exports/uses, so it is complete with the cache off.
 *
 * Edges:
 * - canonical path → the owners (units) that recorded it, at descriptor level (a descriptor's or
 *   an IR's own dependency, with those content IDs), unit level (only the unit's describe/entry
 *   inputs) or observed level (a guide's markdown file, observed by discovery);
 * - canonical path → the roles of an input that is not a unit's content (a set: a page module or
 *   a file its module imports is usually a program input as well): a program input, the
 *   configuration and every other evaluated discovery input, a description (entry) module, an
 *   input of an entry's evaluated closure, the header template, a structural output template;
 * - discovery, content-level and program globs; every ancestor directory of a recorded path;
 * - keyword key → consumer owners (`usedKeywords`, `keyword` dependencies and the root key of each
 *   `key.anchor` / `key#anchor` use, `libs/utils/html/plugins/keywords.plugin.ts`);
 * - owner → exported keys; key → binding digest of the combined keyword set;
 * - entry → its discovery descriptor with markdown digests masked, and those digests, for the
 *   fresh-discovery equality check.
 *
 * API scope → owner edges are not built: a program change reaches the units that read the file
 * (the program files a scoped unit keeps as its own dependencies), and the targeted path refreshes
 * every replayed unit's semantic closures against the current program (`compiler/targeted.ts`).
 *
 * Paths are canonical (`canonicalAliases`): absolute, forward slashes, as recorded and resolved
 * through symlinks of their directory (one `realpath` per directory). A lookup matches any alias.
 */
export type PathLevel = 'descriptor' | 'unit' | 'observed';

export interface PathHit {
  owner: string;
  level: PathLevel;
  /** Descriptor or IR IDs, for `descriptor` hits. */
  ids: string[];
}

export type InputRole =
  | 'program'
  | 'configuration'
  | 'entry-module'
  | 'entry-input'
  | 'header-template'
  | 'output-template';

export interface IndexedOwner {
  id: string;
  entryId: string;
  entryKind: EntryDescriptor['kind'] | 'unknown';
  declarationId?: string;
  descriptors: string[];
  exports: string[];
}

export interface UnitIndexInput {
  /** The candidate snapshot's artifacts (the aggregate artifact holds the program inputs). */
  artifacts: PageArtifact[];
  /** The generation's discovery snapshot. */
  entries: EntryDescriptor[];
  configurationDigest: string;
  headerTemplate?: string;
  /** The discovery service's own dependencies (evaluated inputs, markdown, description globs). */
  discovery: Dependency[];
  /** Structural output templates (`templateDependencies`). */
  templates: Dependency[];
  /** The combined keyword set every link read. */
  keywords: KeywordExport[];
}

type Glob = Extract<Dependency, { kind: 'glob' }>;

/** Absolute, forward slashes; a path already in that form (no `.`, `..` or empty segment) is kept. */
export function normalizePath(file: string): string {
  return file.charCodeAt(0) === 47 &&
    !file.includes('/.') &&
    !file.includes('//') &&
    !file.includes('\\') &&
    !file.endsWith('/')
    ? file
    : path.resolve(file).replace(/\\/g, '/');
}

/** The key a keyword use is resolved under before its anchor (`Key.anchor`, `Key#anchor`). */
export function rootKeyword(used: string): string {
  const match = /^[^.#]+/.exec(used);
  return match ? match[0] : used;
}

/** Digest of each key's binding in a combined keyword set (every export of a key, in order). */
export function keywordBindingDigests(keywords: KeywordExport[]): Map<string, string> {
  const bindings = new Map<string, KeywordExport[]>();
  for (const keyword of keywords)
    bindings.set(keyword.key, [...(bindings.get(keyword.key) ?? []), keyword]);
  return new Map([...bindings].map(([key, values]) => [key, digestOf(values)]));
}

const WINDOWS_DRIVE = /^[A-Za-z]:$/;
const WINDOWS_DRIVE_ROOT = /^[A-Za-z]:\/$/;

/**
 * One canonical path helper: the normalized path, and its physical spelling through the realpath of
 * its nearest existing directory. Directory realpaths are cached per helper.
 */
export function createCanonicalAliases(): (file: string) => string[] {
  const directories = new Map<string, string>();
  const physicalDirectory = (directory: string): string => {
    const cached = directories.get(directory);
    if (cached !== undefined) return cached;
    let resolved = directory;
    if (existsSync(directory)) {
      try {
        resolved = normalizePath(realpathSync.native(directory));
      } catch {
        resolved = directory;
      }
    } else {
      // A drive designator (`C:`) names the drive's current directory on Windows, not its root:
      // the parent of `C:/docs` is `C:/`, and a missing drive root is its own spelling.
      const dirname = path.posix.dirname(directory);
      const parent = WINDOWS_DRIVE.test(dirname) ? `${dirname}/` : dirname;
      resolved =
        parent === directory || WINDOWS_DRIVE_ROOT.test(directory)
          ? directory
          : path.posix.join(physicalDirectory(parent), path.posix.basename(directory));
    }
    directories.set(directory, resolved);
    return resolved;
  };
  const files = new Map<string, string[]>();
  return (file) => {
    const cached = files.get(file);
    if (cached) return cached;
    const normalized = normalizePath(file);
    const directory = path.posix.dirname(normalized);
    const physical =
      directory === normalized
        ? normalized
        : `${physicalDirectory(directory).replace(/\/$/, '')}/${path.posix.basename(normalized)}`;
    const aliases = physical === normalized ? [normalized] : [normalized, physical];
    files.set(file, aliases);
    return aliases;
  };
}

/** The retained discovery facts of one entry, for the fresh-discovery equality check. */
export interface IndexedEntry {
  kind: EntryDescriptor['kind'];
  /** Canonical JSON of the descriptor with the content digests of its markdown files masked. */
  masked: string;
  /** Markdown path → digest recorded in `entry.dependencies`. */
  markdown: Map<string, string>;
  /** The entry's `evaluated` digest, masked in `masked` (compared on its own). */
  evaluated?: string;
}

const MASKED = '<markdown>';

export function indexEntry(entry: EntryDescriptor): IndexedEntry {
  const files = new Set(entry.kind === 'guide' ? entry.markdown.map(normalizePath) : []);
  const markdown = new Map<string, string>();
  let evaluated: string | undefined;
  const dependencies = entry.dependencies.map((dependency) => {
    if (dependency.kind === 'evaluated') {
      evaluated = dependency.digest;
      return { ...dependency, digest: MASKED };
    }
    if (dependency.kind !== 'content' || !files.has(normalizePath(dependency.path)))
      return dependency;
    markdown.set(normalizePath(dependency.path), dependency.digest);
    return { ...dependency, digest: MASKED };
  });
  return {
    kind: entry.kind,
    masked: canonicalJson({ ...entry, dependencies }),
    markdown,
    ...(evaluated !== undefined ? { evaluated } : {}),
  };
}

/**
 * What a generation that reused most of its base's build changed, for {@link UnitIndex.overlay}:
 * the owners whose artifact revision changed (their edges are rebuilt from `input.artifacts`), the
 * entries whose discovery descriptor changed (only their markdown digests can, on the targeted
 * path), and the keys whose binding may have changed (`undefined`: every key is digested again).
 */
export interface UnitIndexDelta {
  replaced: ReadonlySet<string>;
  entries: ReadonlySet<string>;
  keys?: Iterable<string>;
  /**
   * The generation's discovery inputs or program differ from the base's (an entry's closure, its
   * markdown list, the program's files): the roles, the observed markdown owners and the discovery
   * and program globs are built again from `input` instead of being shared with the base.
   */
  inputs?: boolean;
}

export class UnitIndex {
  readonly owners: Map<string, IndexedOwner>;
  readonly configurationDigest: string;
  readonly entries: Map<string, IndexedEntry>;
  readonly bindings: Map<string, string>;
  /** Paths recorded by at least one owner or input (canonical aliases). */
  private readonly paths: Map<string, PathHit[]>;
  /** Roles of each path alias, in the order they were added (see {@link roles}). */
  private readonly roleSets: Map<string, Set<InputRole>>;
  private readonly markdownOwners: Map<string, string[]>;
  private readonly ancestors: Set<string>;
  private readonly consumers: Map<string, Set<string>>;
  /** Per owner: the path aliases, consumed keys and content-level globs it added (overlay removal). */
  private readonly ownerPaths: Map<string, string[]>;
  private readonly ownerKeys: Map<string, string[]>;
  private readonly ownerGlobs: Map<string, Glob[]>;
  /** Discovery globs (no owner). */
  private readonly discoveryGlobs: Glob[];
  readonly structuralGlobs: Glob[];
  readonly programGlobs: Glob[];
  readonly aliases = createCanonicalAliases();
  private readonly normalized = new Map<string, string>();
  /** An overlay shares its base's arrays and sets, so it replaces them instead of changing them. */
  private readonly copying: boolean;

  private constructor(input: UnitIndexInput, base?: { index: UnitIndex; delta: UnitIndexDelta }) {
    this.configurationDigest = input.configurationDigest;
    const entries = new Map(input.entries.map((entry) => [entry.id, entry]));
    this.copying = base !== undefined;
    if (base) {
      const { index, delta } = base;
      // Copy-on-write: the base index belongs to the committed retention entry and is never
      // changed; every structure an owner or entry touches is copied first.
      this.owners = new Map(index.owners);
      this.entries = new Map(index.entries);
      this.paths = new Map(index.paths);
      this.ancestors = new Set(index.ancestors);
      this.consumers = new Map(index.consumers);
      this.ownerPaths = new Map(index.ownerPaths);
      this.ownerKeys = new Map(index.ownerKeys);
      this.ownerGlobs = new Map(index.ownerGlobs);
      this.discoveryGlobs = index.discoveryGlobs;
      this.programGlobs = index.programGlobs;
      this.roleSets = index.roleSets;
      this.markdownOwners = index.markdownOwners;
      for (const id of delta.entries) {
        const entry = entries.get(id);
        if (entry) this.entries.set(id, indexEntry(entry));
        else this.entries.delete(id);
      }
      if (delta.keys) {
        const keys = new Set(delta.keys);
        const fresh = keywordBindingDigests(input.keywords.filter((item) => keys.has(item.key)));
        this.bindings = new Map(index.bindings);
        for (const key of keys) {
          const digest = fresh.get(key);
          if (digest === undefined) this.bindings.delete(key);
          else this.bindings.set(key, digest);
        }
      } else this.bindings = keywordBindingDigests(input.keywords);
      for (const id of delta.replaced) this.removeOwner(id);
      for (const artifact of input.artifacts)
        if (artifact.identity.role !== 'aggregate' && delta.replaced.has(artifact.id))
          this.addOwner(artifact, entries.get(artifact.identity.entryId));
      if (delta.inputs) {
        // Built again, never changed in place: the base still holds the old maps and lists.
        this.roleSets = new Map();
        this.markdownOwners = new Map();
        this.discoveryGlobs = [];
        this.programGlobs = [];
        const unitsByEntry = new Map<string, string[]>();
        for (const artifact of input.artifacts) {
          if (artifact.identity.role === 'aggregate') {
            this.program(artifact.dependencies);
            continue;
          }
          const { entryId } = artifact.identity;
          unitsByEntry.set(entryId, [...(unitsByEntry.get(entryId) ?? []), artifact.id]);
        }
        this.inputs(input, unitsByEntry, false);
      }
      this.structuralGlobs = [...this.discoveryGlobs, ...[...this.ownerGlobs.values()].flat()];
      return;
    }
    this.owners = new Map();
    this.entries = new Map();
    this.paths = new Map();
    this.roleSets = new Map();
    this.markdownOwners = new Map();
    this.ancestors = new Set();
    this.consumers = new Map();
    this.ownerPaths = new Map();
    this.ownerKeys = new Map();
    this.ownerGlobs = new Map();
    this.discoveryGlobs = [];
    this.programGlobs = [];
    this.bindings = keywordBindingDigests(input.keywords);
    for (const entry of input.entries) this.entries.set(entry.id, indexEntry(entry));

    const unitsByEntry = new Map<string, string[]>();
    for (const artifact of input.artifacts) {
      if (artifact.identity.role === 'aggregate') {
        this.program(artifact.dependencies);
        continue;
      }
      this.addOwner(artifact, undefined, entries.get(artifact.identity.entryId));
      unitsByEntry.set(artifact.identity.entryId, [
        ...(unitsByEntry.get(artifact.identity.entryId) ?? []),
        artifact.id,
      ]);
    }

    this.inputs(input, unitsByEntry, true);
    this.structuralGlobs = [...this.discoveryGlobs, ...[...this.ownerGlobs.values()].flat()];
  }

  /**
   * The edges of the generation's inputs that are no unit's content: the observed markdown owners
   * (and, `observed`, their observed-level hits) and the roles of discovery inputs and output
   * templates. A role is added to the path's set; the program roles are added by {@link program}.
   */
  private inputs(
    input: UnitIndexInput,
    unitsByEntry: Map<string, string[]>,
    observed: boolean,
  ): void {
    // Observed-only markdown: discovery hashes it into its entry's dependencies, so every unit of
    // that entry depends on it (its owner input digest).
    for (const entry of input.entries) {
      if (entry.kind !== 'guide') continue;
      for (const file of entry.markdown) {
        const owners = unitsByEntry.get(entry.id) ?? [];
        const normalized = this.canonical(file);
        for (const alias of this.aliases(normalized))
          this.markdownOwners.set(alias, [
            ...new Set([...(this.markdownOwners.get(alias) ?? []), ...owners]),
          ]);
        if (observed)
          for (const owner of owners)
            this.addPath(normalized, { owner, level: 'observed', ids: [] });
      }
    }

    // Inputs that are no unit's content, most specific role first.
    const modules = new Set(input.entries.map((entry) => this.canonical(entry.source.path)));
    const markdown = new Set(
      input.entries.flatMap((entry) =>
        entry.kind === 'guide' ? entry.markdown.map(normalizePath) : [],
      ),
    );
    const entryInputs = new Set(
      input.entries.flatMap((entry) =>
        entry.dependencies.flatMap((dependency) =>
          dependency.kind === 'content' || dependency.kind === 'existence'
            ? [this.canonical(dependency.path)]
            : [],
        ),
      ),
    );
    const header = input.headerTemplate ? this.canonical(input.headerTemplate) : undefined;
    for (const dependency of input.discovery) {
      if (dependency.kind === 'glob') {
        this.discoveryGlobs.push(dependency);
        continue;
      }
      if (dependency.kind !== 'content' && dependency.kind !== 'existence') continue;
      const file = this.canonical(dependency.path);
      if (markdown.has(file)) continue;
      this.addRole(
        file,
        file === header
          ? 'header-template'
          : modules.has(file)
            ? 'entry-module'
            : entryInputs.has(file)
              ? 'entry-input'
              : 'configuration',
      );
    }
    for (const dependency of input.templates)
      if (dependency.kind === 'content' || dependency.kind === 'existence')
        this.addRole(this.canonical(dependency.path), 'output-template');
  }

  /** Builds the index of one generation's build (see {@link UnitIndexInput}). */
  static build(input: UnitIndexInput): UnitIndex {
    return new UnitIndex(input);
  }

  /**
   * The index of a generation that kept most of `base`'s build: `base`'s edges, with those of the
   * `delta.replaced` owners rebuilt from `input.artifacts`, the changed entries re-indexed and the
   * named keys' bindings digested again. It equals {@link build} of the same input when the
   * generation changed nothing else (the same discovery, program and output templates, which the
   * targeted path proves before it reuses anything), except that ancestors of paths no owner
   * records any more are kept: an event there is classified structural, which only costs a full
   * generation. `base` is not changed.
   */
  static overlay(base: UnitIndex, input: UnitIndexInput, delta: UnitIndexDelta): UnitIndex {
    return new UnitIndex(input, { index: base, delta });
  }

  /** The owners (and levels) that recorded `file`, under any of its aliases. */
  hits(file: string): PathHit[] {
    const seen = new Set<string>();
    const result: PathHit[] = [];
    for (const alias of this.aliases(file))
      for (const hit of this.paths.get(alias) ?? []) {
        const key = `${hit.owner}\0${hit.level}\0${hit.ids.join(',')}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(hit);
      }
    return result;
  }

  /**
   * The role of a non-content input (`program` included), under any alias: its first discovery or
   * template role, or `program` when it has no other.
   */
  role(file: string): InputRole | undefined {
    const roles = this.roles(file);
    for (const role of roles) if (role !== 'program') return role;
    return roles.size ? 'program' : undefined;
  }

  /** Every role of a non-content input, under all of its aliases (empty for none). */
  roles(file: string): ReadonlySet<InputRole> {
    const result = new Set<InputRole>();
    for (const alias of this.aliases(file))
      for (const role of this.roleSets.get(alias) ?? []) result.add(role);
    return result;
  }

  /** Owners of `file` when it is a guide's markdown file observed by discovery. */
  markdown(file: string): string[] | undefined {
    for (const alias of this.aliases(file)) {
      const owners = this.markdownOwners.get(alias);
      if (owners) return owners;
    }
    return undefined;
  }

  /** Whether `file` is a strict ancestor directory of a recorded path. */
  isAncestor(file: string): boolean {
    return this.aliases(file).some((alias) => this.ancestors.has(alias));
  }

  /** Why `change` alters the membership of a discovery or content-level glob, if it does. */
  structuralGlobChange(change: FileChange): string | undefined {
    return changedObservation(this.structuralGlobs, [change]);
  }

  /** Why `change` alters the membership of a content-level glob (one a unit recorded), if it does. */
  contentGlobChange(change: FileChange): string | undefined {
    return changedObservation([...this.ownerGlobs.values()].flat(), [change]);
  }

  /** Why `change` alters the membership of a program glob (an API scope), if it does. */
  programGlobChange(change: FileChange): string | undefined {
    return changedObservation(this.programGlobs, [change]);
  }

  /** Owners that use any of `keys` (directly, as a `keyword` dependency, or as a root key). */
  consumersOf(keys: Iterable<string>): Set<string> {
    const result = new Set<string>();
    for (const key of keys) for (const owner of this.consumers.get(key) ?? []) result.add(owner);
    return result;
  }

  /** Counts (evidence and tests). */
  size(): { owners: number; paths: number; roles: number; keys: number; ancestors: number } {
    return {
      owners: this.owners.size,
      paths: this.paths.size,
      roles: this.roleSets.size,
      keys: this.consumers.size,
      ancestors: this.ancestors.size,
    };
  }

  /**
   * One unit's edges: its descriptor- and IR-level paths (with those content IDs), its unit-level
   * inputs, its content-level globs, the keys it consumes, and (overlay only, `entry` given) its
   * guide's observed markdown.
   */
  private addOwner(
    artifact: PageArtifact,
    observed: EntryDescriptor | undefined,
    entry: EntryDescriptor | undefined = observed,
  ): void {
    const owner: IndexedOwner = {
      id: artifact.id,
      entryId: artifact.identity.entryId,
      entryKind: entry?.kind ?? 'unknown',
      ...(artifact.identity.declarationId
        ? { declarationId: artifact.identity.declarationId }
        : {}),
      descriptors: [
        ...(artifact.contentDescriptors ?? []).map((descriptor) => descriptor.id),
        ...artifact.content
          .filter((item) => item.ir.role === 'demo-assets')
          .map((item) => item.ir.id),
      ],
      exports: [...new Set(artifact.exportedKeywords.map((keyword) => keyword.key))].sort(),
    };
    this.owners.set(owner.id, owner);
    const globs: Glob[] = [];
    const descriptorLevel = new Map<string, Set<string>>();
    const addDescriptor = (id: string, dependencies: Dependency[]): void => {
      for (const dependency of dependencies) {
        if (dependency.kind === 'glob') {
          globs.push(dependency);
          continue;
        }
        if (dependency.kind !== 'content' && dependency.kind !== 'existence') continue;
        const file = this.canonical(dependency.path);
        descriptorLevel.set(file, (descriptorLevel.get(file) ?? new Set()).add(id));
      }
    };
    for (const descriptor of artifact.contentDescriptors ?? [])
      addDescriptor(descriptor.id, descriptor.dependencies);
    for (const content of artifact.content) addDescriptor(content.ir.id, content.ir.dependencies);
    for (const [file, ids] of descriptorLevel)
      this.addPath(file, { owner: owner.id, level: 'descriptor', ids: [...ids].sort() });
    for (const dependency of artifact.dependencies) {
      if (dependency.kind === 'glob') globs.push(dependency);
      else if (dependency.kind === 'keyword') this.consume(dependency.key, owner.id);
      else if (dependency.kind === 'content' || dependency.kind === 'existence') {
        const file = this.canonical(dependency.path);
        if (!descriptorLevel.has(file))
          this.addPath(file, { owner: owner.id, level: 'unit', ids: [] });
      }
    }
    for (const used of artifact.usedKeywords) {
      this.consume(used, owner.id);
      this.consume(rootKeyword(used), owner.id);
    }
    if (globs.length) this.ownerGlobs.set(owner.id, globs);
    if (observed?.kind === 'guide')
      for (const file of observed.markdown)
        this.addPath(this.canonical(file), { owner: owner.id, level: 'observed', ids: [] });
  }

  /** Removes every edge `id` added (overlay only; the structures were copied first). */
  private removeOwner(id: string): void {
    for (const alias of this.ownerPaths.get(id) ?? []) {
      const hits = this.paths.get(alias)?.filter((hit) => hit.owner !== id) ?? [];
      if (hits.length) this.paths.set(alias, hits);
      else this.paths.delete(alias);
    }
    for (const key of this.ownerKeys.get(id) ?? []) {
      const owners = new Set(this.consumers.get(key));
      owners.delete(id);
      if (owners.size) this.consumers.set(key, owners);
      else this.consumers.delete(key);
    }
    this.ownerPaths.delete(id);
    this.ownerKeys.delete(id);
    this.ownerGlobs.delete(id);
    this.owners.delete(id);
  }

  /**
   * Program inputs are indexed under every alias, like content paths: a file that is both a program
   * input and some unit's content must be semantic whichever spelling a change reports (a symlinked
   * workspace, `/var` and `/private/var`), or it would be taken for content-only. Their ancestors
   * are not indexed (thousands of files, declaration files included; a change that misses them is
   * `unknown`, which rebuilds in full as well). The retained program's own `stale()` stays the
   * authority on program changes.
   */
  private program(dependencies: Dependency[]): void {
    const add = (file: string): void => {
      for (const alias of this.aliases(this.canonical(file))) this.roleOf(alias).add('program');
    };
    for (const dependency of dependencies) {
      if (dependency.kind === 'glob') this.programGlobs.push(dependency);
      else if (dependency.kind === 'semantic') dependency.files.forEach(add);
      else if (dependency.kind === 'content' || dependency.kind === 'existence')
        add(dependency.path);
    }
  }

  /** {@link normalizePath}, memoised for this build (dependency paths repeat across units). */
  private canonical(file: string): string {
    let normalized = this.normalized.get(file);
    if (normalized === undefined) {
      normalized = normalizePath(file);
      this.normalized.set(file, normalized);
    }
    return normalized;
  }

  private addPath(file: string, hit: PathHit): void {
    let owned = this.ownerPaths.get(hit.owner);
    if (!owned) this.ownerPaths.set(hit.owner, (owned = []));
    for (const alias of this.aliases(file)) {
      const hits = this.paths.get(alias);
      if (hits) {
        if (this.copying) this.paths.set(alias, [...hits, hit]);
        else hits.push(hit);
      } else {
        this.paths.set(alias, [hit]);
        this.addAncestors(alias);
      }
      if (!owned.includes(alias)) owned.push(alias);
    }
  }

  /** Adds a discovery or template role to the path's set (its ancestors are recorded paths). */
  private addRole(file: string, role: Exclude<InputRole, 'program'>): void {
    for (const alias of this.aliases(file)) {
      const roles = this.roleOf(alias);
      if (![...roles].some((item) => item !== 'program')) this.addAncestors(alias);
      roles.add(role);
    }
  }

  private roleOf(alias: string): Set<InputRole> {
    let roles = this.roleSets.get(alias);
    if (!roles) this.roleSets.set(alias, (roles = new Set()));
    return roles;
  }

  private addAncestors(file: string): void {
    let directory = path.posix.dirname(file);
    while (!this.ancestors.has(directory)) {
      this.ancestors.add(directory);
      const parent = path.posix.dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
  }

  private consume(key: string, owner: string): void {
    const owners = this.consumers.get(key);
    if (owners) {
      if (!this.copying) owners.add(owner);
      else if (!owners.has(owner)) this.consumers.set(key, new Set(owners).add(owner));
    } else this.consumers.set(key, new Set([owner]));
    const keys = this.ownerKeys.get(owner);
    if (!keys) this.ownerKeys.set(owner, [key]);
    else if (!keys.includes(key)) keys.push(key);
  }
}
