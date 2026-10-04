import { NG_DOC_SYNTAX_THEME_NAME, ngDocSyntaxTheme } from '@ng-doc/core';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { retryingRename } from '../artifacts';
import { sweepTemporaries } from '../compiler/closure-store';
import type { CompilationRequest, GeneratorConfiguration } from '../contracts';
import { bytesDigest, compareCodeUnits, contentDigest, digestOf } from '../kernel/canonical';
import { HIGHLIGHT_CACHE_FLAG, readFlag } from '../kernel/flags';
import { runtimePackages } from '../kernel/runtime-identity';

/**
 * The cache of highlighted code blocks (`processHtml`'s `highlight` option, `@ng-doc/utils`).
 *
 * Highlighting a block is a pure function of its text, language and meta string, the themes, the
 * fixed options of the highlighting plugin and the Shiki release, so its result is cached under a
 * key that covers all of them: `digestOf({ context, block })`, where the context is the format of
 * this cache, the resolved versions of `shiki`, the Shiki packages it highlights with and
 * `@shikijs/rehype` (`SHIKI_PACKAGES`, from `runtimePackages`) and the identity of each theme (a bundled theme's name; NgDoc's own theme by
 * the digest of its definition), and the block names the plugin's format and options, the theme
 * names, the language before its fallback, the raw meta string and the text. A Shiki upgrade or a
 * plugin change therefore changes every key, and a stale entry is never hit.
 *
 * Every runtime (each thread) keeps one map of entries, which a long-lived runtime keeps across
 * generations. A development generation with the artifact cache on also reads a pack of entries
 * beside the cache (`<hash(projectId)>.highlight.json`) the first time it highlights, and writes
 * it after the cache (best effort, atomically replaced, skipped when unchanged). Production, the
 * reference path and `cache: false` never read or write the pack: they use the map only.
 *
 * A cached entry can never change output: the plugin uses an entry only when it is a JSON array of
 * HAST elements (or of the roots `@shikijs/rehype` replaces a block with) and highlights the block
 * otherwise, it stores only blocks that were highlighted
 * without an error, and a pack of another version or context, or one that cannot be read or
 * parsed, is not read. No dependency or watch input is added: the result depends only on the key.
 *
 * `NGDOC_HIGHLIGHT_CACHE=0` (`CompilationOptions.highlightCache: false`) highlights every block
 * with the plain `@shikijs/rehype` plugin, which sets its highlighter up again for every document;
 * `verify` highlights every hit again, uses the fresh result and reports
 * `CONTENT_HIGHLIGHT_CACHE_MISMATCH` when it differs.
 *
 * The entries are plain strings, so a render thread (`./html-pool`) is handed them (the journal of
 * this runtime's writes, `highlightJournal`) and returns what it hit and highlighted, which the
 * main thread merges (`HighlightSession.merge`); the key is a function of the block alone. Only the
 * main thread reads and writes the pack.
 */

/**
 * The packages whose versions enter every key: Shiki, the packages it highlights with (grammars,
 * themes, regular expression engine, tokenizer) and the plugin that runs it.
 */
const SHIKI_PACKAGES = [
  'shiki',
  '@shikijs/core',
  '@shikijs/langs',
  '@shikijs/themes',
  '@shikijs/engine-oniguruma',
  '@shikijs/vscode-textmate',
  '@shikijs/rehype',
] as const;

/** The warning of a `verify` hit whose highlighting differs from the cached one. */
export const HIGHLIGHT_CACHE_MISMATCH = 'CONTENT_HIGHLIGHT_CACHE_MISMATCH';

/** The pack's format, and this cache's part in every key. Bump it when either changes. */
const PACK_VERSION = 1;

/**
 * Above this size (keys and values, in UTF-16 code units) the pack and the map keep only the
 * entries of the current generation.
 */
export const HIGHLIGHT_CACHE_LIMIT = 64 * 1024 * 1024;

/** The `@ng-doc/utils` block a key is computed from (`NgDocHighlightBlock`). */
export interface HighlightBlock {
  readonly options: Readonly<Record<string, string | number | boolean>>;
  readonly themes: { readonly light: string; readonly dark: string };
  readonly lang: string;
  readonly meta: string;
  readonly code: string;
}

/** The cache one `processHtml` call uses (`NgDocHighlightCache`), with the mismatches it saw. */
export interface HighlightCall {
  key(block: HighlightBlock): string;
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  loads(themes: HighlightBlock['themes']): boolean;
  readonly verify: boolean;
  mismatch(key: string): void;
  /** The keys of the `verify` hits that differed, in the order the call met them. */
  readonly mismatches: readonly string[];
}

interface PackFile {
  version: typeof PACK_VERSION;
  context: string;
  /** Highlighted blocks by key, in code-unit order of the keys. */
  entries: Record<string, string>;
}

/** The entries this runtime knows, by key. */
const memory = new Map<string, string>();
let memoryBytes = 0;
/**
 * Every write into `memory` since it was last cleared, in order, and the number of clears: a render
 * thread replays the journal from where it stopped, or from the start after a clear.
 */
const journal: Array<[string, string]> = [];
let epoch = 0;
/** The contexts this runtime highlighted a block under or read a pack of: their themes load. */
const proven = new Set<string>();
/**
 * Per pack file, the context, keys and content digest of what this runtime last read or wrote
 * there: a generation that would write the same keys does not write the file again while it still
 * holds those bytes.
 */
const packs = new Map<string, { context: string; keys: readonly string[]; content: string }>();

const sizeOf = (key: string, value: string): number => key.length + value.length;

function remember(key: string, value: string): void {
  const previous = memory.get(key);
  if (previous !== undefined) memoryBytes -= sizeOf(key, previous);
  memory.set(key, value);
  memoryBytes += sizeOf(key, value);
  journal.push([key, value]);
}

function forget(): void {
  memory.clear();
  memoryBytes = 0;
  journal.length = 0;
  epoch += 1;
}

/** The writes into this runtime's entries since they were last cleared, and the clear count. */
export function highlightJournal(): { epoch: number; entries: ReadonlyArray<[string, string]> } {
  return { epoch, entries: journal };
}

/** The cache's switch: `off`, `on` or `verify`. */
export function highlightCacheSwitch(options: {
  highlightCache?: boolean | 'verify';
}): 'off' | 'on' | 'verify' {
  if (options.highlightCache === false) return 'off';
  const value = readFlag(HIGHLIGHT_CACHE_FLAG).value;
  return value === 'off' ? 'off' : options.highlightCache === 'verify' ? 'verify' : value;
}

/**
 * The cache of one generation, or undefined when blocks are highlighted without it: with the
 * switch off, and on the reference path (`incrementalReuse: false`), which recomputes everything.
 * Only a development generation with the artifact cache on keeps a pack.
 */
export function createHighlightSession(
  options: {
    projectId: string;
    incrementalReuse?: boolean;
    highlightCache?: boolean | 'verify';
  },
  request: Pick<CompilationRequest, 'mode'>,
  configuration: Pick<GeneratorConfiguration, 'cacheEnabled' | 'cacheRoot' | 'themes'>,
): HighlightSession | undefined {
  const mode = highlightCacheSwitch(options);
  if (mode === 'off' || options.incrementalReuse === false) return undefined;
  const pack =
    request.mode === 'development' && configuration.cacheEnabled
      ? path.join(configuration.cacheRoot, `${digestOf(options.projectId)}.highlight.json`)
      : undefined;
  return new HighlightSession(configuration.themes, mode === 'verify', pack);
}

/** One generation's use of the cache: what it hit or highlighted, and its pack. */
export class HighlightSession {
  /** The keys this generation hit or highlighted. */
  private readonly used = new Set<string>();
  readonly context: string;
  private loaded = false;
  /** An entry was replaced (a corrupt one, or a `verify` repair): the pack must be written. */
  private replaced = false;

  constructor(
    readonly themes: { readonly light: string; readonly dark: string },
    readonly verify: boolean,
    readonly pack: string | undefined,
  ) {
    const engine = runtimePackages();
    this.context = digestOf({
      version: PACK_VERSION,
      engine: Object.fromEntries(SHIKI_PACKAGES.map((name) => [name, engine[name] ?? null])),
      themes: { light: themeIdentity(themes.light), dark: themeIdentity(themes.dark) },
    });
    // A long-lived runtime whose map outgrew the limit starts again from the pack.
    if (memoryBytes > HIGHLIGHT_CACHE_LIMIT) {
      forget();
      packs.clear();
    }
  }

  /** The cache of one `processHtml` call. */
  call(): HighlightCall {
    this.load();
    const mismatches: string[] = [];
    const { context, used, themes } = this;
    return {
      key: (block) => digestOf({ context, block }),
      get: (key) => {
        const value = memory.get(key);
        if (value !== undefined) used.add(key);
        return value;
      },
      set: (key, value) => {
        if (memory.has(key)) this.replaced = true;
        remember(key, value);
        used.add(key);
        proven.add(context);
      },
      loads: (requested) =>
        requested.light === themes.light && requested.dark === themes.dark && proven.has(context),
      verify: this.verify,
      mismatch: (key) => mismatches.push(key),
      mismatches,
    };
  }

  /**
   * What a render thread needs to use this cache: the context its keys are made in, whether hits
   * are checked again, and whether the themes are known to load. Reads the pack first, so the
   * journal holds its entries.
   */
  prepare(): { context: string; verify: boolean; proven: boolean } {
    this.load();
    return { context: this.context, verify: this.verify, proven: proven.has(this.context) };
  }

  /** The entry this runtime holds for `key`, without counting it as used. */
  peek(key: string): string | undefined {
    return memory.get(key);
  }

  /**
   * Takes in what one document's highlighting recorded out of plan order (a render thread, or the
   * main thread rendering ahead), as if this thread had processed it now, in plan order: a fresh
   * value equal to the known one is a hit (another task highlighted the block first), any other
   * replaces it; and a `verify` difference counts only while the known entry is still not the
   * fresh value (an earlier document in plan order repaired it, as a sequential render would).
   * Returns the differences this document reports.
   */
  merge(record: {
    used: readonly string[];
    fresh: ReadonlyArray<readonly [string, string]>;
    mismatched: readonly string[];
  }): number {
    const fresh = new Map(record.fresh);
    let mismatches = 0;
    for (const key of record.mismatched) {
      const known = memory.get(key);
      if (known !== undefined && known !== fresh.get(key)) mismatches += 1;
    }
    for (const [key, value] of record.fresh) {
      const known = memory.get(key);
      if (known === value) continue;
      if (known !== undefined) this.replaced = true;
      remember(key, value);
      proven.add(this.context);
    }
    for (const key of record.used) if (memory.has(key)) this.used.add(key);
    return mismatches;
  }

  /** Reads the pack once per runtime and context; an unusable pack is not read. */
  private load(): void {
    if (this.loaded || !this.pack) return;
    this.loaded = true;
    if (packs.get(this.pack)?.context === this.context) return;
    try {
      const bytes = readFileSync(this.pack);
      const value: unknown = JSON.parse(bytes.toString('utf8'));
      if (!isPackFile(value) || value.context !== this.context) return;
      const keys = Object.keys(value.entries).sort(compareCodeUnits);
      for (const key of keys) if (!memory.has(key)) remember(key, value.entries[key]!);
      if (keys.length) proven.add(this.context);
      packs.set(this.pack, { context: this.context, keys, content: bytesDigest(bytes) });
    } catch {
      // Absent or unreadable: every block is highlighted.
    }
  }

  /**
   * Writes the pack after the artifact cache: the entries this generation hit or highlighted, plus
   * those the pack held before unless the generation rendered every content (`complete`), or the
   * result would exceed {@link HIGHLIGHT_CACHE_LIMIT}. Best effort: a pack that is not written
   * only makes a later generation highlight again.
   */
  async save(complete: boolean): Promise<void> {
    if (!this.pack) return;
    const file = this.pack;
    const last = packs.get(file);
    const previous = !complete && last?.context === this.context ? last.keys : [];
    let selected = new Set([...previous, ...this.used].filter((key) => memory.has(key)));
    const size = (keys: Iterable<string>) => {
      let total = 0;
      for (const key of keys) total += sizeOf(key, memory.get(key)!);
      return total;
    };
    if (size(selected) > HIGHLIGHT_CACHE_LIMIT)
      selected = new Set([...this.used].filter((key) => memory.has(key)));
    const keys = [...selected].sort(compareCodeUnits);
    if (
      !this.replaced &&
      last?.context === this.context &&
      last.keys.length === keys.length &&
      last.keys.every((key, index) => key === keys[index]) &&
      last.content === currentContent(file)
    )
      return;
    const content: PackFile = {
      version: PACK_VERSION,
      context: this.context,
      entries: Object.fromEntries(keys.map((key) => [key, memory.get(key)!])),
    };
    const text = JSON.stringify(content);
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await mkdir(path.dirname(file), { recursive: true });
      await sweepTemporaries(file);
      await writeFile(temporary, text, { flag: 'wx' });
      await retryingRename(rename)(temporary, file);
      packs.set(file, { context: this.context, keys, content: contentDigest(text) });
      this.replaced = false;
    } catch {
      // Best effort: the next generation that writes the pack tries again.
      packs.delete(file);
    } finally {
      await rm(temporary, { force: true }).catch(() => undefined);
    }
  }
}

/** A bundled theme by its name; NgDoc's own theme, which is not bundled, by its definition. */
function themeIdentity(name: string): string | { ngDoc: string } {
  return name === NG_DOC_SYNTAX_THEME_NAME ? { ngDoc: digestOf(ngDocSyntaxTheme()) } : name;
}

/** The content digest of a file's current bytes (undefined when it cannot be read). */
function currentContent(file: string): string | undefined {
  try {
    return bytesDigest(readFileSync(file));
  } catch {
    return undefined;
  }
}

function isPackFile(value: unknown): value is PackFile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const file = value as Record<string, unknown>;
  const entries = file['entries'];
  return (
    file['version'] === PACK_VERSION &&
    typeof file['context'] === 'string' &&
    !!entries &&
    typeof entries === 'object' &&
    !Array.isArray(entries) &&
    Object.values(entries).every((entry) => typeof entry === 'string')
  );
}

/** Forgets every entry, pack and proven context of this runtime (tests). */
export function resetHighlightCache(): void {
  forget();
  proven.clear();
  packs.clear();
}
