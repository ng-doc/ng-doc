import type { Dependency } from '../contracts';
import { globIdentity } from './canonical';
import { readFlag, SEMANTIC_RECORDER_FLAG } from './flags';

export { contentDigest } from './canonical';
export { readText } from './observations';

/**
 * Recorded footprints: the one recorder of every cross-file read a phase call makes. This leaf
 * module holds the stage-neutral part (scopes, footprints and the files channel) that the semantic
 * service and the content compiler share; file reads and their digests come from
 * `observations.ts`, and the TypeScript channels live in `semantic/recorder.ts`.
 *
 * Footprints are attached to phase results out of band (a WeakMap keyed by the result object).
 * In a scoped development generation the semantic service turns each query's footprint into its
 * `semantic-closure` dependency (`semantic/semantic-closure.ts`); nothing else reads them.
 */

/** The phase calls that each get one recorder scope. */
export type FootprintScopeKind =
  | 'enumerateApi'
  | 'describeGuide'
  | 'renderFragment'
  | 'entry-doc'
  | 'content-describe'
  | 'content-compile'
  | 'link'
  | 'capture';

/** How a file entered `R(scope)`; kept only in verify mode (attribution for tests and gaps). */
export type FootprintChannel =
  | 'checker'
  | 'symbol-docs'
  | 'language-service'
  | 'lookup'
  | 'node-factory'
  | 'merge';

export interface Footprint {
  readonly scope: FootprintScopeKind;
  /** The unit/IR the scope ran for (entry id, declaration id or path, content id). */
  readonly key: string;
  /** `R(scope)`: the source files the semantic channels touched, sorted. */
  readonly files: readonly string[];
  /** The files channel: every read, probe and glob, as read identities, sorted. */
  readonly reads: readonly string[];
  /**
   * False when part of the call's semantic side recorded nothing (recording off or unavailable for
   * a query it made, or a nested footprint that is itself incomplete). An incomplete footprint
   * states no dependency set at all: `files` is then a lower bound, never "depends on nothing".
   * Scoped semantic invalidation treats it like a unit without a recorded `R`.
   */
  readonly complete: boolean;
  /**
   * The classes whose derived-class list (the API "See Also" section) the scope read, as
   * `path#start` identities, sorted. The list depends on heritage clauses anywhere in the program,
   * which `files` cannot state, so it is part of the scope's semantic closure. Present only when
   * the scope read one.
   */
  readonly derived?: readonly string[];
  /** Verify mode only: the files each channel recorded. */
  readonly channels?: Readonly<Partial<Record<FootprintChannel, readonly string[]>>>;
}

/** `NGDOC_SEMANTIC_RECORDER`: `0`/`off`/`false`/`no` turns recording off, `verify` adds the gap assertion. */
export const SEMANTIC_RECORDER_ENV = SEMANTIC_RECORDER_FLAG;
export type RecorderMode = 'off' | 'on' | 'verify';

/** The recorder mode from an explicit value or the environment; recording is on by default. */
export function recorderMode(
  value: string | undefined = process.env[SEMANTIC_RECORDER_ENV],
): RecorderMode {
  return readFlag(SEMANTIC_RECORDER_ENV, { [SEMANTIC_RECORDER_ENV]: value }).value;
}

/** The files-channel identity of a physical dependency; undefined for non-physical kinds. */
export function readIdentity(dependency: Dependency): string | undefined {
  if (dependency.kind === 'content' || dependency.kind === 'existence') return dependency.path;
  if (dependency.kind === 'glob') return globIdentity(dependency);
  return undefined;
}

/** One open recorder scope: `R` (files), the files channel (reads) and, in verify mode, gaps. */
export class FootprintScope {
  readonly files = new Set<string>();
  readonly reads = new Set<string>();
  /** Classes whose derived-class list was read (see {@link Footprint.derived}). */
  readonly derived = new Set<string>();
  /** Verify mode: per-channel attribution. */
  readonly channels?: Map<FootprintChannel, Set<string>>;
  /** Verify mode: hooked reads on nodes whose file was not in `R` when read. */
  readonly gaps: string[] = [];
  private incomplete = false;

  constructor(
    readonly kind: FootprintScopeKind,
    readonly key: string,
    readonly verify: boolean = false,
  ) {
    if (verify) this.channels = new Map();
  }

  /** Adds a file to `R`. */
  record(file: string, channel: FootprintChannel): void {
    this.files.add(file);
    if (this.channels) {
      let set = this.channels.get(channel);
      if (!set) this.channels.set(channel, (set = new Set()));
      set.add(file);
    }
  }

  /** Adds a class whose derived-class list the scope read. */
  recordDerived(identity: string): void {
    this.derived.add(identity);
  }

  /**
   * Marks the footprint incomplete: the scope made a read whose answer depends on files it cannot
   * name (a whole-program reference search), so its files are only a lower bound.
   */
  unscoped(): void {
    this.incomplete = true;
  }

  /** Adds one files-channel observation. */
  observe(dependency: Dependency): void {
    const identity = readIdentity(dependency);
    if (identity !== undefined) this.reads.add(identity);
  }

  /** Adds every files-channel observation of a dependency list. */
  observeAll(dependencies: readonly Dependency[]): void {
    for (const dependency of dependencies) this.observe(dependency);
  }

  /**
   * Replays a nested or cached footprint into this scope. A missing (`undefined`) or incomplete one
   * makes this scope incomplete: the call it stands for recorded nothing, or not everything.
   */
  merge(footprint: Footprint | undefined): void {
    if (!footprint?.complete) this.incomplete = true;
    if (!footprint) return;
    for (const file of footprint.files) this.record(file, 'merge');
    for (const read of footprint.reads) this.reads.add(read);
    for (const identity of footprint.derived ?? []) this.derived.add(identity);
  }

  seal(): Footprint {
    return {
      scope: this.kind,
      key: this.key,
      files: [...this.files].sort(),
      reads: [...this.reads].sort(),
      // A failure while recording (a gap outside verify mode) leaves the files a lower bound.
      complete: !this.incomplete && this.gaps.length === 0,
      ...(this.derived.size ? { derived: [...this.derived].sort() } : {}),
      ...(this.channels
        ? {
            channels: Object.fromEntries(
              [...this.channels].map(([channel, files]) => [channel, [...files].sort()]),
            ),
          }
        : {}),
    };
  }
}

const attached = new WeakMap<object, Footprint>();

/** Attaches a footprint to a phase result out of band; the result object is returned unchanged. */
export function attachFootprint<T extends object>(result: T, footprint: Footprint): T {
  attached.set(result, footprint);
  return result;
}

/** The footprint recorded for a phase result, if it was produced with recording on. */
export function footprintOf(result: object | undefined): Footprint | undefined {
  return result ? attached.get(result) : undefined;
}
