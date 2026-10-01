/**
 * Fixtures and differential arms of the incremental tests (`incremental*.vitest.ts`), which are split
 * over several files so that they run in parallel processes and CI shards. Each file disposes what
 * its tests created with `afterEach(disposeAll)`.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, vi } from 'vitest';

import { createOutputCommitter } from '../../artifacts';
import type {
  ArtifactSnapshot,
  CompilationContext,
  CompilationResult,
  FileChange,
  OutputManifest,
} from '../../contracts';
import { createRuntimeRetention } from '../../worker/protocol';
import {
  type CompilationOptions,
  type DryRunRecord,
  createCompilationService,
  resetIncrementalRetention,
  resetTargetedDryRun,
  targetedDryRun,
} from '../index';
import {
  type Fixture as CorpusFixture,
  type Step as CorpusStep,
  cleanup as corpusCleanup,
  settle,
  update as corpusUpdate,
} from './targeted-corpus';

/** Disposables of the fixtures, services and committers a test created; see {@link disposeAll}. */
export const cleanup: Array<() => unknown> = [];

/** Releases everything a test created and resets the compiler's process-wide test state. */
export async function disposeAll(): Promise<void> {
  vi.restoreAllMocks();
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
  for (const dispose of corpusCleanup.splice(0).reverse()) await dispose();
  resetIncrementalRetention();
  resetTargetedDryRun();
}

export interface Fixture {
  root: string;
  options: CompilationOptions;
  write(file: string, content: string): string;
  remove(file: string): string;
  reset(): void;
  create(overrides?: Partial<CompilationOptions>): ReturnType<typeof createCompilationService>;
}

export function fixture(
  cache: boolean = true,
  files?: (root: string) => Record<string, string>,
): Fixture {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'ngdoc-incremental-')));
  cleanup.push(() => rmSync(root, { recursive: true, force: true }));
  const include = path.join(root, 'docs/shared/include.md');
  const initial: Record<string, string> = files?.(root) ?? {
    'tsconfig.json': JSON.stringify({
      compilerOptions: { target: 'ES2022', types: [], skipLibCheck: true },
      include: ['docs/**/*.ts'],
    }),
    'ng-doc.config.ts': `export default { docsPath: 'docs', cache: ${cache} };`,
    'docs/ng-doc.api.ts': `const api = { title: 'API', keyword: 'ApiIndex', scopes: [{ name: 'Public', route: 'public', include: ['docs/api*.ts'] }] }; export default api;`,
    'docs/api.ts': '/** Actual declaration. */ export class Actual { /** Value. */ value = 1; }',
    'docs/api-helper.ts':
      "import { Actual } from './api';\n/** Returns the given actual. */ export function helper(value: Actual): Actual { return value; }",
    'docs/guide/ng-doc.page.ts': `/** Guide introduction. */ const page = { title: 'Guide', route: 'guide', mdFile: './index.md' }; export default page;`,
    'docs/guide/index.md': `---\nkeyword: Guide\n---\n# Guide heading\n\nBody with \`Actual\` and \`helper\`.\n\n{% include ${JSON.stringify(include)} %}\n\n\`\`\`typescript\nconst value: Actual = new Actual();\n\`\`\`\n`,
    'docs/second/ng-doc.page.ts': `const page = { title: 'Second', route: 'second', mdFile: './index.md' }; export default page;`,
    'docs/second/index.md': `# Second\n\nSee \`*Guide\` for details.\n\n{% include ${JSON.stringify(include)} %}\n`,
    'docs/third/ng-doc.page.ts': `const page = { title: 'Third', route: 'third', mdFile: './index.md' }; export default page;`,
    'docs/third/index.md': '# Third\n\nPlain prose only.\n',
    'docs/shared/include.md': 'Shared include text.',
  };
  const write = (file: string, content: string) => {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
    return target;
  };
  const remove = (file: string) => {
    const target = path.join(root, file);
    unlinkSync(target);
    return target;
  };
  const reset = () => {
    rmSync(path.join(root, 'docs'), { recursive: true, force: true });
    for (const directory of ['out', 'cache'])
      rmSync(path.join(root, directory), { recursive: true, force: true });
    for (const [file, content] of Object.entries(initial)) write(file, content);
  };
  reset();
  const options: CompilationOptions = {
    projectId: 'fixture',
    workspaceRoot: root,
    configFile: path.join(root, 'ng-doc.config.ts'),
    defaults: {
      docsRoot: path.join(root, 'docs'),
      tsConfig: path.join(root, 'tsconfig.json'),
      outputRoot: path.join(root, 'out'),
      cacheRoot: path.join(root, 'cache'),
    },
    compilerVersion: 'test-v1',
    toolchainDigest: 'real-ts6-shiki',
  };
  const create = (overrides: Partial<CompilationOptions> = {}) => {
    const service = createCompilationService({ ...options, ...overrides });
    cleanup.push(() => service.dispose());
    return service;
  };
  return { root, options, write, remove, reset, create };
}

export const compile = (
  service: ReturnType<typeof createCompilationService>,
  generation: number,
  previous?: ArtifactSnapshot,
  changes: FileChange[] = [],
) =>
  service.compile(
    { generation, mode: 'development', changes, ...(previous ? { previous } : {}) },
    new AbortController().signal,
  );

export function success(result: CompilationResult): ArtifactSnapshot {
  expect(result.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
  expect(result.candidate).toBeDefined();
  return result.candidate!;
}

/** Everything a reader of the published site observes. */
export function published(result: CompilationResult) {
  const candidate = success(result);
  const artifacts = [...candidate.artifacts].sort((left, right) => left.id.localeCompare(right.id));
  return {
    outputs: Object.fromEntries(
      artifacts
        .flatMap((artifact) => artifact.outputs)
        .map((output) => [output.path, output.content] as const)
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
    search: artifacts.map((artifact) => [artifact.id, artifact.searchRecords]),
    keywords: artifacts.map((artifact) => [
      artifact.id,
      artifact.exportedKeywords,
      artifact.usedKeywords,
    ]),
    routes: artifacts.map((artifact) => [artifact.id, artifact.routes, artifact.apiList]),
    content: artifacts.map((artifact) => [
      artifact.id,
      artifact.content.map((item) => [
        item.ir.id,
        item.html,
        item.searchRecords,
        item.keywordDigest,
      ]),
    ]),
    descriptors: artifacts.map((artifact) => [
      artifact.id,
      (artifact.contentDescriptors ?? []).map((descriptor) => descriptor.id),
    ]),
    diagnostics: result.diagnostics,
  };
}

/** A cold build of the current tree: a fresh runtime, no previous snapshot, an empty cache. */
export async function cold(f: Fixture): Promise<CompilationResult> {
  const cache = f.options.defaults.cacheRoot;
  const parked = `${cache}.parked`;
  const hadCache = existsSync(cache);
  if (hadCache) renameSync(cache, parked);
  try {
    return await compile(f.create(), 1);
  } finally {
    rmSync(cache, { recursive: true, force: true });
    if (hadCache) renameSync(parked, cache);
  }
}

export interface Step {
  name: string;
  apply(f: Fixture): FileChange[];
}

export const update = (file: string): FileChange => ({ kind: 'update', path: file });

export const steps: Step[] = [
  {
    name: 'guide body edit',
    apply: (f) => [
      update(
        f.write(
          'docs/guide/index.md',
          readFileSync(path.join(f.root, 'docs/guide/index.md'), 'utf8') +
            '\nAn edited paragraph.\n',
        ),
      ),
    ],
  },
  {
    name: 'include edit',
    apply: (f) => [update(f.write('docs/shared/include.md', 'Edited include text.'))],
  },
  {
    name: 'API JSDoc edit',
    apply: (f) => [
      update(
        f.write(
          'docs/api.ts',
          '/** Edited declaration. */ export class Actual { /** Value. */ value = 1; }',
        ),
      ),
    ],
  },
  {
    name: 'no-op save',
    apply: (f) => [
      update(
        f.write(
          'docs/guide/index.md',
          readFileSync(path.join(f.root, 'docs/guide/index.md'), 'utf8'),
        ),
      ),
    ],
  },
  {
    name: 'guide keyword binding change (title)',
    apply: (f) => [
      update(
        f.write(
          'docs/guide/ng-doc.page.ts',
          `/** Guide introduction. */ const page = { title: 'Guide Renamed', route: 'guide', mdFile: './index.md' }; export default page;`,
        ),
      ),
    ],
  },
  {
    name: 'API binding removal (rename)',
    apply: (f) => [
      update(
        f.write(
          'docs/api.ts',
          '/** Edited declaration. */ export class Actual { /** Value. */ value = 1; }\nexport class Extra {}',
        ),
      ),
      update(
        f.write(
          'docs/api-helper.ts',
          "import { Actual } from './api';\n/** Returns the given actual. */ export function renamedHelper(value: Actual): Actual { return value; }",
        ),
      ),
    ],
  },
  {
    name: 'page removal',
    apply: (f) => [
      { kind: 'delete', path: f.remove('docs/third/index.md') },
      { kind: 'delete', path: f.remove('docs/third/ng-doc.page.ts') },
    ],
  },
  {
    name: 'page re-creation',
    apply: (f) => [
      {
        kind: 'create',
        path: f.write(
          'docs/third/ng-doc.page.ts',
          `const page = { title: 'Third', route: 'third', mdFile: './index.md' }; export default page;`,
        ),
      },
      { kind: 'create', path: f.write('docs/third/index.md', '# Third\n\nPlain prose only.\n') },
    ],
  },
];

/** Runs the steps with one service, each compile receiving the previous candidate. */
export async function runChain(
  f: Fixture,
  service: ReturnType<typeof createCompilationService>,
  onStep?: (step: string, result: CompilationResult) => Promise<void> | void,
  chain: Step[] = steps,
): Promise<CompilationResult[]> {
  const results = [await compile(service, 1)];
  await onStep?.('initial', results[0]);
  for (const [index, step] of chain.entries()) {
    const changes = step.apply(f);
    const result = await compile(service, index + 2, success(results.at(-1)!), changes);
    results.push(result);
    await onStep?.(step.name, result);
  }
  return results;
}

// The targeted rebuild (compiler/targeted.ts): a watch chain with it on, the same chain with it
// off (`targetedRebuild: false`, what NGDOC_TARGETED_REBUILD=0 passes) and a cold build of every
// step's tree must agree byte for byte. The targeted arm commits its candidates the way the
// session does (a delta commit for a targeted result, the full commit otherwise), and the
// committed tree must equal the full candidate's outputs. Content steps must really compile
// targeted (path accounting); a FULL-versus-FULL comparison proves nothing about the targeted path.

export interface Arm {
  name: string;
  service: ReturnType<typeof createCompilationService>;
  context: () => CompilationContext;
  base?: ArtifactSnapshot;
}

/** A service with its own runtime retention slot, so the two arms never share a retained entry. */
export function arm(f: CorpusFixture, targetedRebuild: boolean | 'verify'): Arm {
  const slot = createRuntimeRetention();
  return {
    name: targetedRebuild === 'verify' ? 'verify' : targetedRebuild ? 'on' : 'off',
    service: f.create({ targetedRebuild }),
    context: () => {
      const context: CompilationContext = { lifetime: 'watch' };
      Object.defineProperty(context, 'retention', {
        value: slot.serve('compile-end'),
        enumerable: false,
      });
      return context;
    },
  };
}

/**
 * Each arm keeps its own artifact cache and memo (swapped into the configured cache root before it
 * compiles): the arms must not reuse each other's cache, or the first generation of the second
 * arm would restore where the first one built.
 */
export function useCache(f: CorpusFixture, current: Arm): void {
  const cache = f.path('cache');
  const owner = f.path('cache.owner');
  const holder = existsSync(owner) ? readFileSync(owner, 'utf8') : undefined;
  if (holder === current.name) return;
  if (holder && existsSync(cache)) renameSync(cache, `${cache}.${holder}`);
  else rmSync(cache, { recursive: true, force: true });
  if (existsSync(`${cache}.${current.name}`)) renameSync(`${cache}.${current.name}`, cache);
  writeFileSync(owner, current.name);
}

export const watchCompile = (
  f: CorpusFixture,
  current: Arm,
  generation: number,
  changes: FileChange[],
) => {
  useCache(f, current);
  return current.service.compile(
    {
      generation,
      mode: 'development',
      changes,
      ...(current.base
        ? { previous: current.base, contentRequest: { origin: 'filesystem' as const } }
        : {}),
    },
    new AbortController().signal,
    current.context(),
  );
};

/** A cold build of the current tree: a fresh one-shot service, no previous snapshot or cache. */
export async function coldCorpus(f: CorpusFixture): Promise<CompilationResult> {
  const cache = f.path('cache');
  const parked = `${cache}.parked`;
  const hadCache = existsSync(cache);
  if (hadCache) renameSync(cache, parked);
  const service = f.create({ targetedRebuild: false });
  try {
    return await service.compile(
      { generation: 1, mode: 'development', changes: [] },
      new AbortController().signal,
      { lifetime: 'generation' },
    );
  } finally {
    // Released now, not after the test: a corpus chain builds one cold program per step, and
    // holding them all until the test ends exhausts the heap of a coverage run.
    await service.dispose();
    rmSync(cache, { recursive: true, force: true });
    if (hadCache) renameSync(parked, cache);
  }
}

/** Every file of the committed output tree (the manifest and staging internals excluded). */
export function tree(root: string): Record<string, string> {
  const result: Record<string, string> = {};
  const walk = (directory: string) => {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.name.startsWith('.ng-doc-')) continue;
      if (entry.isDirectory()) walk(file);
      else result[path.relative(root, file)] = readFileSync(file, 'utf8');
    }
  };
  walk(root);
  return Object.fromEntries(
    Object.entries(result).sort(([left], [right]) => left.localeCompare(right)),
  );
}

export interface ArmsOutcome {
  targeted: number;
  full: number;
  failed: number;
  delta: number;
}

/**
 * Runs `steps` on both arms. Before each targeted compile the off arm compiles the same tree (so
 * both see the same committed outputs); the targeted candidate is then committed. A step whose
 * generation fails keeps the base, as the session does.
 */
/** Keyword loader invocations of one step, per arm (with `targetedArms`' `count`). */
export interface LoaderCalls {
  off: number;
  on: number;
}

/**
 * A step of the arms, optionally with a check of its targeted rebuild record. `pinned` runs the
 * off arm's compile and the cold build in the state the targeted arm's pinned keyword loader
 * results were taken in: a targeted generation keeps them, so that is the full generation it must
 * equal.
 */
export type ArmStep = CorpusStep & {
  cold?: false;
  check?: (record: DryRunRecord, calls: LoaderCalls) => void;
  pinned?: <T>(compile: () => Promise<T>) => Promise<T>;
};

export async function targetedArms(
  f: CorpusFixture,
  steps: ArmStep[],
  count: () => number = () => 0,
): Promise<ArmsOutcome> {
  const committer = createOutputCommitter({ outputRoot: f.path('out') });
  cleanup.push(() => committer.dispose());
  const on = arm(f, true);
  const off = arm(f, false);
  const outcome: ArmsOutcome = { targeted: 0, full: 0, failed: 0, delta: 0 };
  let manifest: OutputManifest | undefined;
  let committed: ArtifactSnapshot | undefined;
  await settle();
  for (const [index, step] of [undefined, ...steps].entries()) {
    const label = step?.name ?? 'initial';
    const changes = step ? step.apply(f) : [];
    await settle();
    const asPinned = step?.pinned ?? (<T>(compile: () => Promise<T>) => compile());
    const calls: LoaderCalls = { off: count(), on: 0 };
    const reference = await asPinned(() => watchCompile(f, off, index + 1, changes));
    calls.off = count() - calls.off;
    calls.on = count();
    const before = targetedDryRun().counters.generations;
    const result = await watchCompile(f, on, index + 1, changes);
    calls.on = count() - calls.on;
    expect({ step: index, label, result: JSON.stringify(result) }).toEqual({
      step: index,
      label,
      result: JSON.stringify(reference),
    });
    const record = targetedDryRun().last!;
    expect(targetedDryRun().counters.generations, label).toBe(before + 1);
    const targeted = on.service.targetedResult(result);
    expect(targeted, label).toBe(record.published === 'targeted');
    if (step?.expect === 'content')
      expect({ step: index, label, published: record.published }, record.reason).toEqual({
        step: index,
        label,
        published: 'targeted',
      });
    if (step?.expect === 'full') expect(record.published, label).toBe('full');
    step?.check?.(record, calls);
    if (!result.candidate) {
      outcome.failed++;
      continue;
    }
    outcome[targeted ? 'targeted' : 'full']++;
    // Commit like the session: only a targeted result may be a delta against the base.
    const commit = await committer.commit(
      {
        generation: index + 1,
        candidate: result.candidate,
        ...(manifest ? { previous: manifest } : {}),
        ...(targeted && manifest && committed ? { base: { snapshot: committed, manifest } } : {}),
      },
      { isCurrent: () => true },
      new AbortController().signal,
    );
    expect(commit.status, label).toBe('committed');
    if (commit.status !== 'committed') continue;
    if (targeted && manifest) outcome.delta++;
    manifest = commit.manifest;
    committed = result.candidate;
    on.base = result.candidate;
    off.base = reference.candidate!;
    const outputs = published(result).outputs;
    expect({ label, tree: tree(f.path('out')) }).toEqual({ label, tree: outputs });
    if (step?.cold !== false)
      expect({ label, ...published(await asPinned(() => coldCorpus(f))) }).toEqual({
        label,
        ...published(result),
      });
  }
  return outcome;
}

/** Appends `text` to a fixture file and reports the update. */
export const appendTo = (f: CorpusFixture, file: string, text: string): FileChange =>
  corpusUpdate(f.write(file, f.read(file) + text));
