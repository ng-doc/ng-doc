import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Options } from 'prettier';

import { retryingRename } from '../artifacts';
import { sweepTemporaries } from '../compiler/closure-store';
import type { CompilationRequest, GeneratorConfiguration } from '../contracts';
import {
  bytesDigest,
  canonicalJsonStrict,
  compareCodeUnits,
  contentDigest,
  digestOf,
} from '../kernel/canonical';
import { FORMAT_CACHE_FLAG, readFlag } from '../kernel/flags';
import { packageVersions, runtimePackages } from '../kernel/runtime-identity';

/**
 * The cache of formatted code: API signatures and demo snippets that `formatCode` formats with
 * Prettier (`helpers/format-code.ts`), the main thread's largest cost after highlighting at a
 * cold start. Each call resolved the Prettier configuration again and formatted through
 * `@prettier/sync`'s worker.
 *
 * - **Configuration.** One generation resolves the configuration of a directory once. The files
 *   it reads (`.prettierrc*`, `prettier.config.*`, `.editorconfig`, `package.json` in the workspace
 *   root and every directory above it) are already program inputs of every page that formats
 *   (`trackFormatterConfiguration`), so an edit of one runs a new generation, which resolves
 *   again.
 * - **Formatted code.** Formatting is a pure function of the code, the parser, the resolved
 *   configuration and the Prettier release, so its result is cached under
 *   `digestOf({ context, parser, config, code })`: the context is this cache's format and the
 *   resolved versions of `prettier` and `@prettier/sync`, and `config` the resolved configuration
 *   with the versions of the plugins it names. A configuration that cannot be identified exactly
 *   (a value JSON cannot hold, a plugin given as a path or that does not resolve to a package) is
 *   never cached: such code is formatted every time. Code Prettier rejects with a syntax error
 *   (signatures such as a bare `constructor(…): T;` always are) is cached as such and throws
 *   again, so `formatCode` returns it unformatted as before; any other error stores nothing.
 * - **Storage.** One map per runtime, kept across generations by a long-lived runtime and
 *   cleared when it outgrows {@link FORMAT_CACHE_LIMIT}. Development generations with the artifact
 *   cache read `<hash(projectId)>.format.json` beside it once per runtime and context, and write it
 *   after the cache (best effort, atomic, skipped when unchanged), like the highlight cache.
 *   Production, `cache: false` and the reference path never read or write the pack.
 *
 * No dependency or watch input is added: the result depends only on the key, and the
 * configuration's own files are recorded where the program is built.
 *
 * `NGDOC_FORMAT_CACHE=0` (`CompilationOptions.formatCache: false`) formats every call as before;
 * `verify` resolves the configuration and formats every hit again, uses the fresh result and
 * reports `CONTENT_FORMAT_CACHE_MISMATCH` when one differs. The semantic service formats through
 * the session the compiler installs for the generation (`semantic/formatting.ts`).
 */

/** The warning of a `verify` hit (or configuration) that differs from the cached one. */
export const FORMAT_CACHE_MISMATCH = 'CONTENT_FORMAT_CACHE_MISMATCH';

/**
 * The pack's format, and this cache's part in every key. Bump it when either changes, or when
 * `formatCode` changes the options it formats with or what it does with the result.
 */
const PACK_VERSION = 1;

/**
 * The entry of code Prettier rejects with a syntax error (a pure function of the key, like its
 * output). `formatCode` returns such code as it is, so a hit throws for it to do so again. Every
 * other entry is `=` followed by the formatted code; any other failure is never stored.
 */
const SYNTAX_ERROR = '!';

function encode(format: () => string): string {
  try {
    return `=${format()}`;
  } catch (error) {
    if (error instanceof Error && error.name === 'SyntaxError' && 'loc' in error)
      return SYNTAX_ERROR;
    throw error;
  }
}

function decode(entry: string): string {
  if (entry === SYNTAX_ERROR)
    throw new SyntaxError('Prettier rejected this code before (format cache).');
  return entry.slice(1);
}

/** The packages whose versions enter every key. */
const PRETTIER_PACKAGES = ['prettier', '@prettier/sync'] as const;

/**
 * Above this size (keys and values, in UTF-16 code units) the pack and the map keep only the
 * entries of the current generation.
 */
export const FORMAT_CACHE_LIMIT = 16 * 1024 * 1024;

interface PackFile {
  version: typeof PACK_VERSION;
  context: string;
  /** Formatted code by key, in code-unit order of the keys. */
  entries: Record<string, string>;
}

/** The entries this runtime knows, by key. */
const memory = new Map<string, string>();
let memoryBytes = 0;
/** Per pack file, what this runtime last read or wrote there (see the highlight cache). */
const packs = new Map<string, { context: string; keys: readonly string[]; content: string }>();
const sizeOf = (key: string, value: string): number => key.length + value.length;

/**
 *
 * @param key
 * @param value
 */
function remember(key: string, value: string): void {
  const previous = memory.get(key);
  if (previous !== undefined) memoryBytes -= sizeOf(key, previous);
  memory.set(key, value);
  memoryBytes += sizeOf(key, value);
}

/**
 * The cache's switch: `off`, `on` or `verify`.
 * @param options
 * @param options.formatCache
 */
export function formatCacheSwitch(options: {
  formatCache?: boolean | 'verify';
}): 'off' | 'on' | 'verify' {
  if (options.formatCache === false) return 'off';
  const value = readFlag(FORMAT_CACHE_FLAG).value;
  return value === 'off' ? 'off' : options.formatCache === 'verify' ? 'verify' : value;
}

/**
 * The cache of one generation, or undefined when code is formatted without it: with the switch
 * off, and on the reference path (`incrementalReuse: false`), which recomputes everything. Only
 * a development generation with the artifact cache on keeps a pack.
 * @param options
 * @param options.projectId
 * @param options.incrementalReuse
 * @param options.formatCache
 * @param request
 * @param configuration
 */
export function createFormatSession(
  options: { projectId: string; incrementalReuse?: boolean; formatCache?: boolean | 'verify' },
  request: Pick<CompilationRequest, 'mode'>,
  configuration: Pick<GeneratorConfiguration, 'cacheEnabled' | 'cacheRoot'>,
): FormatSession | undefined {
  const mode = formatCacheSwitch(options);
  if (mode === 'off' || options.incrementalReuse === false) return undefined;
  const pack =
    request.mode === 'development' && configuration.cacheEnabled
      ? path.join(configuration.cacheRoot, `${digestOf(options.projectId)}.format.json`)
      : undefined;
  return new FormatSession(mode === 'verify', pack);
}

/**
 * One generation's use of the cache: its resolved configurations, the keys it used, its pack. It
 * is a `FormatCodeCache` (`helpers/format-cache.ts`), structurally: the published declarations
 * reach this class, and they cannot import from outside the generator.
 */
export class FormatSession {
  readonly context: string;
  /** The keys this generation hit or formatted. */
  private readonly used = new Set<string>();
  /** The resolved configuration per directory (`''` for the process's working directory). */
  private readonly configs = new Map<string, Options | null>();
  /** Each resolved configuration's identity in the keys; undefined: not cacheable. */
  private readonly identities = new Map<object | null, string | undefined>();
  private loaded = false;
  /** An entry was replaced (a `verify` repair): the pack must be written. */
  private replaced = false;
  private mismatchCount = 0;

  constructor(
    readonly verify: boolean,
    readonly pack: string | undefined,
  ) {
    const engine = runtimePackages();
    this.context = digestOf({
      version: PACK_VERSION,
      engine: Object.fromEntries(PRETTIER_PACKAGES.map((name) => [name, engine[name] ?? null])),
    });
    // A long-lived runtime whose map outgrew the limit starts again from the pack.
    if (memoryBytes > FORMAT_CACHE_LIMIT) {
      memory.clear();
      memoryBytes = 0;
      packs.clear();
    }
  }

  /** How many `verify` hits and configurations differed from the cached ones. */
  get mismatches(): number {
    return this.mismatchCount;
  }

  config(configDirectory: string | undefined, resolve: () => Options | null): Options | null {
    const directory = configDirectory ?? '';
    if (this.configs.has(directory)) {
      const known = this.configs.get(directory)!;
      if (!this.verify) return known;
      const fresh = resolve();
      if (canonicalJsonStrict(fresh) === canonicalJsonStrict(known)) return known;
      this.mismatchCount += 1;
      return this.remember(directory, configDirectory, fresh);
    }
    return this.remember(directory, configDirectory, resolve());
  }

  format(
    input: { code: string; parser: string; config: Options | null },
    format: () => string,
  ): string {
    const identity = this.identities.get(input.config);
    // Not a configuration this session resolved and identified: formatted every time.
    if (identity === undefined) return format();
    this.load();
    const key = digestOf({
      context: this.context,
      parser: input.parser,
      config: identity,
      code: input.code,
    });
    const known = memory.get(key);
    // An entry of another shape (a damaged pack) is a miss, formatted and replaced.
    const usable = known !== undefined && (known === SYNTAX_ERROR || known.startsWith('='));
    if (usable && !this.verify) {
      this.used.add(key);
      return decode(known);
    }
    const value = encode(format);
    if (known !== undefined && known !== value) {
      if (usable) this.mismatchCount += 1;
      this.replaced = true;
    }
    if (known !== value) remember(key, value);
    this.used.add(key);
    return decode(value);
  }

  /**
   * Writes the pack after the artifact cache: the entries this generation hit or formatted, plus
   * those the pack held before unless the generation rendered every content (`complete`), or the
   * result would exceed {@link FORMAT_CACHE_LIMIT}. Best effort.
   * @param complete
   */
  async save(complete: boolean): Promise<void> {
    if (!this.pack) return;
    // Nothing formatted, nothing read: the pack on disk (if any) stays as it is.
    if (!this.loaded) return;
    const file = this.pack;
    const last = packs.get(file);
    const previous = !complete && last?.context === this.context ? last.keys : [];
    let selected = new Set([...previous, ...this.used].filter((key) => memory.has(key)));
    const size = (keys: Iterable<string>) => {
      let total = 0;
      for (const key of keys) total += sizeOf(key, memory.get(key)!);
      return total;
    };
    if (size(selected) > FORMAT_CACHE_LIMIT)
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

  private remember(
    directory: string,
    configDirectory: string | undefined,
    config: Options | null,
  ): Options | null {
    const frozen = config && Object.isFrozen(config) ? config : config && Object.freeze(config);
    this.configs.set(directory, frozen);
    if (!this.identities.has(frozen))
      this.identities.set(frozen, identityOf(frozen, configDirectory));
    return frozen;
  }

  /** Reads the pack once per runtime and context; an unusable pack is not read. */
  private load(): void {
    if (this.loaded) return;
    this.loaded = true;
    if (!this.pack || packs.get(this.pack)?.context === this.context) return;
    try {
      const bytes = readFileSync(this.pack);
      const value: unknown = JSON.parse(bytes.toString('utf8'));
      if (!isPackFile(value) || value.context !== this.context) return;
      const keys = Object.keys(value.entries).sort(compareCodeUnits);
      for (const key of keys) if (!memory.has(key)) remember(key, value.entries[key]!);
      packs.set(this.pack, { context: this.context, keys, content: bytesDigest(bytes) });
    } catch {
      // Absent or unreadable: every call is formatted.
    }
  }
}

/**
 * A resolved configuration's identity: its exact JSON with the version of every plugin it names,
 * or undefined when that is not exact (see the module description).
 * @param config
 * @param configDirectory
 */
function identityOf(
  config: Options | null,
  configDirectory: string | undefined,
): string | undefined {
  const json = canonicalJsonStrict(config);
  if (json === undefined) return undefined;
  const plugins: unknown[] = Array.isArray(config?.plugins) ? config.plugins : [];
  const versions: Record<string, string> = {};
  for (const plugin of plugins) {
    if (typeof plugin !== 'string' || plugin.startsWith('.') || path.isAbsolute(plugin))
      return undefined;
    const version = packageVersions([[plugin]], configDirectory ?? process.cwd())[plugin];
    if (!version) return undefined;
    versions[plugin] = version;
  }
  return digestOf({ config: json, plugins: versions });
}

/**
 * The content digest of a file's current bytes (undefined when it cannot be read).
 * @param file
 */
function currentContent(file: string): string | undefined {
  try {
    return bytesDigest(readFileSync(file));
  } catch {
    return undefined;
  }
}

/**
 *
 * @param value
 */
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

/** Forgets every entry and pack of this runtime (tests). */
export function resetFormatCache(): void {
  memory.clear();
  memoryBytes = 0;
  packs.clear();
}
