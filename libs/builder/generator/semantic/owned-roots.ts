import { minimatch } from 'minimatch';
import { randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, parse, posix } from 'node:path';
import { type FileSystemHost, type RuntimeDirEntry, Project, ts } from 'ts-morph';

import { contentDigest } from '../kernel/canonical';
import { normalize } from './dependencies';

/**
 * Generator-owned roots hold this generator's own output and cache. They are never semantic
 * inputs: the TypeScript program must not resolve into them and dependency tracking must not
 * record them, otherwise a generation's own commit would change the next generation's
 * semantic scope. Every other path resolves exactly as through the real file system.
 */
export class OwnedRoots {
  private readonly roots: string[];
  /** The raw reads that began with a byte order mark, which the program's text omits. */
  private readonly marked = new Map<string, { text: string; digest: string }>();

  constructor(roots: readonly string[]) {
    // Each root is matched both as configured and through symlinks (for example macOS
    // /var -> /private/var), because real paths reach this view through realpath.
    const configured = [...new Set(roots.filter(Boolean).map(normalize))];
    this.roots = [...new Set(configured.flatMap((root) => [root, canonical(root)]))].sort();
  }

  has(file: string): boolean {
    return this.describe(file) !== undefined;
  }

  /** The owned root containing a path, if any. */
  describe(file: string): string | undefined {
    const path = normalize(file);
    return this.roots.find((root) => path === root || path.startsWith(`${root}/`));
  }

  /**
   * A non-owned path that is a symlink into an owned root stays unresolved: it is read through
   * its own path like any other input instead of resolving to a hidden owned file.
   */
  realpath(path: string, resolve: (path: string) => string): string {
    const real = resolve(path);
    return this.has(real) && !this.has(path) ? path : real;
  }

  /** Notes a raw text read of the program's file system (see {@link contentDigest}). */
  recordRead(file: string, text: string): void {
    const path = normalize(file);
    if (text.charCodeAt(0) === 0xfeff)
      this.marked.set(path, { text: text.slice(1), digest: contentDigest(text) });
    else this.marked.delete(path);
  }

  /**
   * The content digest of a program file whose text is `text`. TypeScript drops a leading byte
   * order mark from the text it compiles, while every other reader (and the refresher) digests the
   * file's bytes; so a file read with one is digested from its raw read, and the recorded digest
   * matches theirs.
   */
  contentDigest(file: string, text: string): string {
    const marked = this.marked.get(normalize(file));
    return marked && marked.text === text ? marked.digest : contentDigest(text);
  }

  /** A module resolution host view without owned paths; owned probes are neither made nor recorded. */
  resolutionHost(host: ts.ModuleResolutionHost): ts.ModuleResolutionHost {
    return {
      ...host,
      fileExists: (file) => !this.has(file) && host.fileExists(file),
      readFile: (file) => (this.has(file) ? undefined : host.readFile(file)),
      directoryExists: (directory) =>
        !this.has(directory) && (host.directoryExists?.(directory) ?? true),
      getDirectories: (path) =>
        this.has(path)
          ? []
          : (host.getDirectories?.(path) ?? []).filter((name) => !this.has(join(path, name))),
      ...(host.realpath
        ? { realpath: (path: string) => this.realpath(path, (value) => host.realpath!(value)) }
        : {}),
    };
  }

  /** The real ts-morph file system with owned paths absent. Writes are never issued by semantic. */
  fileSystem(): FileSystemHost {
    // Validated before the Project is built, so an incompatible ts-morph fails every
    // synchronization rather than only one that happens to read an owned file.
    notFound ??= missingFileError(realFileSystem());
    return new OwnedRootsFileSystem(realFileSystem(), this);
  }
}

/** The real path of a possibly missing path: its nearest existing ancestor, resolved. */
function canonical(path: string): string {
  const missing: string[] = [];
  for (let cursor = normalize(path); ; cursor = dirname(cursor)) {
    try {
      return normalize(join(realpathSync(cursor), ...missing));
    } catch {
      if (dirname(cursor) === cursor) return normalize(path);
      missing.unshift(basename(cursor));
    }
  }
}

let real: FileSystemHost | undefined;
let notFound: (new (path: string) => Error) | undefined;

type NotFoundError = new (path: string) => Error;

/**
 * Returns the error class a real ts-morph file system throws for a missing file. ts-morph's
 * transactional file system recognises "does not exist" only by that class (for example in
 * readFileIfExistsSync), and the class is not part of its public declarations. It is therefore
 * observed from the real host itself. If a ts-morph upgrade stops reporting a missing file this
 * way, owned-root hiding cannot be enforced and synchronization fails loudly instead of silently
 * treating owned files as unreadable.
 */
export function missingFileError(fileSystem: FileSystemHost): NotFoundError {
  // A missing child of the filesystem root: always searchable, so only ENOENT is expected.
  const probe = join(
    parse(process.cwd()).root,
    `ngdoc-owned-root-probe-${randomUUID()}`,
    'missing.ts',
  );
  let observed: unknown;
  try {
    fileSystem.readFileSync(probe);
  } catch (error) {
    observed = error;
  }
  const type = observed instanceof Error ? (observed.constructor as NotFoundError) : undefined;
  if (!type || type === Error || (observed as { code?: unknown }).code !== 'ENOENT') {
    const code = (observed as { code?: unknown } | undefined)?.code;
    throw new Error(
      `[NGDOC_SEMANTIC_OWNED_ROOTS] Reading the missing probe ${probe} through the ts-morph file system ${
        observed === undefined
          ? 'did not fail'
          : `failed with ${type && type !== Error ? type.name : 'a plain error'} (code ${String(code)})`
      }; a dedicated ENOENT error class is required to hide generator-owned roots from the semantic program.`,
    );
  }
  return type;
}

function fileNotFound(path: string): Error {
  return new notFound!(path);
}

/** ts-morph's default real file system host, obtained without importing its private package. */
function realFileSystem(): FileSystemHost {
  return (real ??= new Project({ useInMemoryFileSystem: false }).getFileSystem());
}

class OwnedRootsFileSystem implements FileSystemHost {
  constructor(
    private readonly real: FileSystemHost,
    private readonly owned: OwnedRoots,
  ) {}

  isCaseSensitive(): boolean {
    return this.real.isCaseSensitive();
  }
  delete(path: string): Promise<void> {
    return this.real.delete(path);
  }
  deleteSync(path: string): void {
    this.real.deleteSync(path);
  }
  readDirSync(dirPath: string): RuntimeDirEntry[] {
    if (this.owned.has(dirPath)) return [];
    // The real host reports entry names as full paths; a relative name is resolved defensively.
    return this.real
      .readDirSync(dirPath)
      .filter(
        (entry) => !this.owned.has(isAbsolute(entry.name) ? entry.name : join(dirPath, entry.name)),
      );
  }
  async readFile(filePath: string, encoding?: string): Promise<string> {
    if (this.owned.has(filePath)) throw fileNotFound(filePath);
    const text = await this.real.readFile(filePath, encoding);
    this.owned.recordRead(filePath, text);
    return text;
  }
  readFileSync(filePath: string, encoding?: string): string {
    if (this.owned.has(filePath)) throw fileNotFound(filePath);
    const text = this.real.readFileSync(filePath, encoding);
    this.owned.recordRead(filePath, text);
    return text;
  }
  writeFile(filePath: string, fileText: string): Promise<void> {
    return this.real.writeFile(filePath, fileText);
  }
  writeFileSync(filePath: string, fileText: string): void {
    this.real.writeFileSync(filePath, fileText);
  }
  mkdir(dirPath: string): Promise<void> {
    return this.real.mkdir(dirPath);
  }
  mkdirSync(dirPath: string): void {
    this.real.mkdirSync(dirPath);
  }
  move(srcPath: string, destPath: string): Promise<void> {
    return this.real.move(srcPath, destPath);
  }
  moveSync(srcPath: string, destPath: string): void {
    this.real.moveSync(srcPath, destPath);
  }
  copy(srcPath: string, destPath: string): Promise<void> {
    return this.real.copy(srcPath, destPath);
  }
  copySync(srcPath: string, destPath: string): void {
    this.real.copySync(srcPath, destPath);
  }
  async fileExists(filePath: string): Promise<boolean> {
    return !this.owned.has(filePath) && (await this.real.fileExists(filePath));
  }
  fileExistsSync(filePath: string): boolean {
    return !this.owned.has(filePath) && this.real.fileExistsSync(filePath);
  }
  async directoryExists(dirPath: string): Promise<boolean> {
    return !this.owned.has(dirPath) && (await this.real.directoryExists(dirPath));
  }
  directoryExistsSync(dirPath: string): boolean {
    return !this.owned.has(dirPath) && this.real.directoryExistsSync(dirPath);
  }
  realpathSync(path: string): string {
    return this.owned.realpath(path, (value) => this.real.realpathSync(value));
  }
  getCurrentDirectory(): string {
    return this.real.getCurrentDirectory();
  }
  async glob(patterns: readonly string[]): Promise<string[]> {
    return (await this.real.glob(patterns)).filter((file) => !this.owned.has(file));
  }
  globSync(patterns: readonly string[]): string[] {
    return this.real.globSync(patterns).filter((file) => !this.owned.has(file));
  }
}

/** Workspace-relative shapes of the files the generator writes below each owned root. */
const OUTPUT_SHAPES = [
  'index.ts',
  'routes.ts',
  'context.ts',
  'guides/ngdoc-probe/page.ts',
  'guides/ngdoc-probe/ngdoc-probe/page.ts',
  'guides/ngdoc-probe/index/page.ts',
  'guides/ngdoc-probe/demo-assets.ts',
  'guides/ngdoc-probe/playgrounds.ts',
  'guides/ngdoc-probe/page.content.mjs',
  'guides/ngdoc-probe/page.content.d.mts',
  'guides/ngdoc-probe/page.source.mjs',
  'guides/ngdoc-probe/page.source.d.mts',
  'api/ngdoc-probe/ngdoc-probe/page.ts',
  'assets/indexes.json',
  'assets/keywords.json',
  'assets/api-list.json',
];
const CACHE_SHAPES = [
  'ngdoc-probe.compilation-index.json',
  'ngdoc-probe/ngdoc-probe.artifact.json',
];

/**
 * The first owned root an API scope pattern can reach, judged from the patterns and the file
 * shapes the generator writes, not from files that exist now: a scope that can match generated
 * output would otherwise start failing only after the first commit. A generated path is excluded
 * when a scope exclude matches it or one of its directories, as the scope scan's ignore does.
 * Matches that exist anyway are still rejected by the caller's actual-match check.
 */
export function ownedRootReach(
  workspaceRoot: string,
  include: readonly string[],
  exclude: readonly string[],
  roots: { outputRoot: string; cacheRoot: string },
): { root: string; pattern: string } | undefined {
  const base = normalize(workspaceRoot);
  const relative = (pattern: string): string =>
    posix.normalize(isAbsolute(pattern) ? posix.relative(base, normalize(pattern)) : pattern);
  const excludes = exclude.map(relative);
  const excluded = (path: string): boolean => {
    const parts = path.split('/');
    return parts.some((_, index) => {
      const prefix = parts.slice(0, index + 1).join('/');
      return excludes.some((pattern) => minimatch(prefix, pattern, { dot: true }));
    });
  };
  for (const [root, shapes] of [
    [roots.outputRoot, OUTPUT_SHAPES],
    [roots.cacheRoot, CACHE_SHAPES],
  ] as const) {
    if (!root) continue;
    const target = posix.relative(base, normalize(root)) || '.';
    const probes = shapes
      .map((shape) => posix.normalize(`${target}/${shape}`))
      .filter((probe) => !excluded(probe));
    const pattern = include
      .filter((item) => !item.startsWith('!'))
      .find((item) => probes.some((probe) => minimatch(probe, relative(item), { dot: true })));
    if (pattern) return { root: normalize(root), pattern };
  }
  return undefined;
}
