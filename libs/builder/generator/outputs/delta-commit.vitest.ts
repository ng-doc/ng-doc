/**
 * The delta commit against the full commit through the real in-process compiler, the real session
 * and the real transactional committer.
 *
 * The same sequence of edits runs twice in the same workspace (so absolute paths, and with them
 * every revision, are identical): once with delta commits (the default) and once with the kill
 * switch (`delta: false`, the full commit without delta planning). After every step the results
 * (status, diagnostics, whyRebuilt, superseded), the manifest bytes and the whole output tree must
 * be identical, except for one documented difference: an external edit of an unchanged output
 * survives a delta commit and is repaired by the next full commit (here a reconcile).
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';

import {
  type CommitMutation,
  type CommitTelemetry,
  type TransactionalOutputCommitter,
  createOutputCommitter,
} from '../artifacts';
import { createCompilationService } from '../compiler';
import type {
  BuildEvent,
  BuildResult,
  Diagnostic,
  FileChange,
  FileEventSource,
} from '../contracts';
import { forwardSlashes, hostPath } from '../kernel/paths';
import { type GeneratorBuildSession, createBuildSession } from '../session/build-session';

/** Fault injection on the committer's stage removal and a record of its output reads. */
const hooks = vi.hoisted(() => ({
  removing: undefined as undefined | (() => void),
  outputRoot: '',
  reads: [] as string[],
}));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    rm: async (...args: Parameters<typeof actual.rm>) => {
      const hook = hooks.removing;
      if (hook && String(args[0]).includes('.ng-doc-stage-')) {
        hooks.removing = undefined;
        hook();
      }
      return actual.rm(...args);
    },
    readFile: (async (...args: Parameters<typeof actual.readFile>) => {
      // The committer reads native paths (backslashes on Windows); compare and record them with
      // forward slashes.
      const file = forwardSlashes(String(args[0]));
      if (hooks.outputRoot && file.startsWith(`${forwardSlashes(hooks.outputRoot)}/`))
        hooks.reads.push(forwardSlashes(path.relative(hooks.outputRoot, file)));
      return actual.readFile(...args);
    }) as typeof actual.readFile,
  };
});

const sha = (value: string | Buffer) =>
  createHash('sha256').update(value).digest('hex').slice(0, 16);

class Events implements FileEventSource {
  listener?: (events: FileChange[]) => unknown;
  async subscribe(
    listener: (events: FileChange[]) => unknown,
    _onError: (diagnostic: Diagnostic) => void,
  ) {
    this.listener = listener;
    return { dispose: async () => {} };
  }
  emit(...events: FileChange[]) {
    this.listener?.(events);
  }
}

async function until(predicate: () => boolean, timeout: number = 60_000): Promise<void> {
  // Not Date.now(): the test stops that clock.
  const end = performance.now() + timeout;
  while (!predicate()) {
    if (performance.now() > end) throw new Error('Timed out waiting for a generation');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function tree(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  const walk = async (directory: string) => {
    for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(file);
      else result[path.relative(root, file)] = sha(await readFile(file));
    }
  };
  await walk(root);
  return Object.fromEntries(
    Object.entries(result).sort(([left], [right]) => left.localeCompare(right)),
  );
}

interface Step {
  label: string;
  generations: Array<
    Pick<BuildResult, 'status' | 'generation' | 'diagnostics' | 'whyRebuilt'> & {
      superseded?: boolean;
    }
  >;
  manifest: string;
  tree: Record<string, string>;
  telemetry: Array<CommitTelemetry | undefined>;
  reads: string[];
}

let root: string;
/** The output of an unrelated page that the external-edit steps delete and edit. */
let missing = '';
beforeAll(async () => {
  root = await realpath(await mkdtemp(path.join(tmpdir(), 'ng-doc-s4-session-')));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

/** Runs the whole sequence in a fresh copy of the fixture and records every step. */
async function run(delta: boolean): Promise<Step[]> {
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  const docs = path.join(root, 'docs');
  const outputRoot = path.join(root, 'generated', 'ng-doc', 'delta-commit');
  const cacheRoot = path.join(root, 'cache');
  const guide = path.join(docs, 'guide');
  const first = path.join(guide, 'first.md.nunj');
  const second = path.join(guide, 'second.md.nunj');
  const shared = path.join(guide, 'shared.nunj');
  const api = path.join(docs, 'api.ts');
  const put = async (file: string, text: string) => {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, text);
  };
  const tsConfig = path.join(root, 'tsconfig.json');
  const configFile = path.join(root, 'ng-doc.config.ts');
  await put(
    tsConfig,
    JSON.stringify({
      compilerOptions: { target: 'ES2022', types: [], skipLibCheck: true },
      include: ['docs/**/*.ts'],
    }),
  );
  await put(configFile, `export default { docsPath: 'docs', outDir: 'generated', cache: false };`);
  await put(
    path.join(docs, 'ng-doc.category.ts'),
    `const Parent = { title: 'Parent', route: 'parent' }; export default Parent;`,
  );
  await put(
    path.join(docs, 'ng-doc.api.ts'),
    `const Api = { title: 'API', scopes: [{ name: 'Public', route: 'public', include: ['docs/api*.ts'] }] }; export default Api;`,
  );
  await put(
    api,
    `/** First API. */ export class FirstApi {}\n/** Second API. */ export class SecondApi {}`,
  );
  await put(
    path.join(guide, 'ng-doc.page.ts'),
    `import Parent from '../ng-doc.category'; const Guide = { title: 'Guide', route: 'guide', category: Parent, mdFile: ['./first.md.nunj', './second.md.nunj'] }; export default Guide;`,
  );
  await put(
    first,
    `---\ntitle: First tab\nroute: first\n---\n# First\n{% include './shared.nunj' %}\nSee \`FirstApi\`.`,
  );
  await put(
    second,
    `---\ntitle: Second tab\nroute: second\n---\n# Second\n{% include './shared.nunj' %}`,
  );
  await put(shared, 'Shared version one.');
  await put(
    path.join(docs, 'other', 'ng-doc.page.ts'),
    `import Parent from '../ng-doc.category'; const Other = { title: 'Other', route: 'other', category: Parent, mdFile: './index.md.nunj' }; export default Other;`,
  );
  await put(path.join(docs, 'other', 'index.md.nunj'), `# Other\nAn unrelated page.`);

  let fault: CommitMutation | undefined;
  const results: BuildResult[] = [];
  const steps: Step[] = [];
  let session!: GeneratorBuildSession;
  let committer!: TransactionalOutputCommitter;
  let events!: Events;
  const telemetry: Array<CommitTelemetry | undefined> = [];
  const start = async () => {
    const compiler = createCompilationService({
      projectId: 'delta-commit',
      workspaceRoot: root,
      configFile,
      defaults: { docsRoot: docs, tsConfig, outputRoot, cacheRoot },
      compilerVersion: 'delta-commit-v1',
      toolchainDigest: 'delta-commit-toolchain',
    });
    committer = createOutputCommitter({
      outputRoot,
      delta,
      beforeMutation: (operation) => {
        if (operation === fault) throw new Error(`injected ${operation} fault`);
      },
    }) as TransactionalOutputCommitter;
    const commit = committer.commit.bind(committer);
    committer.commit = async (...args) => {
      const result = await commit(...args);
      telemetry.push(committer.inspect());
      return result;
    };
    session = createBuildSession({ compiler, committer }, { batchDelayMs: 0 });
    hooks.outputRoot = outputRoot;
    hooks.reads = [];
    const initial = await session.buildOnce({ mode: 'development' });
    if (initial.status !== 'success')
      throw new Error(`development build: ${JSON.stringify(initial.diagnostics, null, 2)}`);
    results.push(initial);
    events = new Events();
    const watch = await session.watch(events, (event: BuildEvent) => {
      if (event.kind === 'result') results.push(event.result);
    });
    // The watch either reuses the development build (the startup baseline) or runs its own first
    // generation, a reconciling one (full commit); either way it is recorded with the start.
    await watch.initial;
    await until(() => !session.inspect().building);
  };
  const record = async (label: string, from: number) => {
    // The committer's reads, before this helper reads the tree itself.
    const reads = [...new Set(hooks.reads.splice(0))].sort();
    const generations = results.slice(from).map((result) => ({
      status: result.status,
      generation: result.generation,
      diagnostics: result.diagnostics,
      whyRebuilt: result.whyRebuilt,
      ...(result.status === 'success' && result.superseded ? { superseded: true } : {}),
    }));
    steps.push({
      label,
      generations,
      manifest: await readFile(path.join(outputRoot, '.ng-doc-output-manifest.json'), 'utf8'),
      tree: await tree(outputRoot),
      telemetry: telemetry.splice(0),
      reads,
    });
  };
  /** One edit (or several in one batch) and the generations it causes. */
  const step = async (
    label: string,
    mutate: () => Promise<unknown>,
    changes: FileChange[],
    count = 1,
  ) => {
    const from = results.length;
    hooks.reads = [];
    await mutate();
    events.emit(...changes);
    await until(() => results.length >= from + count && !session.inspect().building);
    await record(label, from);
  };
  // A watcher reports the engine's spelling of a path (forward slashes on Windows).
  const update = (file: string): FileChange => ({ kind: 'update', path: hostPath(file) });

  try {
    await start();
    await record('cold start (development build, every output written)', 0);
    await step(
      'first edit after the cold start: guide',
      () =>
        put(
          first,
          `---\ntitle: First tab\nroute: first\n---\n# First\n{% include './shared.nunj' %}\nSee \`FirstApi\`. Edited.`,
        ),
      [update(first)],
    );
    await step('include edit', () => put(shared, 'Shared version two.'), [update(shared)]);
    await step(
      'API edit',
      () =>
        put(
          api,
          `/** First API, edited. */ export class FirstApi {}\n/** Second API. */ export class SecondApi {}`,
        ),
      [update(api)],
    );
    const extra = path.join(docs, 'extra');
    await step(
      'page added',
      async () => {
        await put(
          path.join(extra, 'ng-doc.page.ts'),
          `import Parent from '../ng-doc.category'; const Extra = { title: 'Extra', route: 'extra', category: Parent, mdFile: './index.md.nunj' }; export default Extra;`,
        );
        await put(path.join(extra, 'index.md.nunj'), '# Extra\nA new page.');
      },
      [
        { kind: 'create', path: path.join(extra, 'ng-doc.page.ts') },
        { kind: 'create', path: path.join(extra, 'index.md.nunj') },
      ],
    );
    const renamed = path.join(docs, 'renamed');
    await step(
      'page renamed (folder and route)',
      async () => {
        await rename(extra, renamed);
        await put(
          path.join(renamed, 'ng-doc.page.ts'),
          `import Parent from '../ng-doc.category'; const Extra = { title: 'Extra', route: 'renamed', category: Parent, mdFile: './index.md.nunj' }; export default Extra;`,
        );
      },
      [
        { kind: 'delete', path: path.join(extra, 'ng-doc.page.ts') },
        { kind: 'delete', path: path.join(extra, 'index.md.nunj') },
        { kind: 'create', path: path.join(renamed, 'ng-doc.page.ts') },
        { kind: 'create', path: path.join(renamed, 'index.md.nunj') },
      ],
    );
    await step('page deleted', () => rm(renamed, { recursive: true }), [
      { kind: 'delete', path: path.join(renamed, 'ng-doc.page.ts') },
      { kind: 'delete', path: path.join(renamed, 'index.md.nunj') },
    ]);
    fault = 'publish-output';
    await step(
      'failed commit (publish fault, rolled back)',
      () =>
        put(
          second,
          `---\ntitle: Second tab\nroute: second\n---\n# Second, failed\n{% include './shared.nunj' %}`,
        ),
      [update(second)],
    );
    fault = undefined;
    await step(
      'edit after the failed commit',
      () =>
        put(
          first,
          `---\ntitle: First tab\nroute: first\n---\n# First after failure\n{% include './shared.nunj' %}`,
        ),
      [update(first)],
    );
    // The next change supersedes the generation while its committer removes the stage.
    await step(
      'commit superseded after publication, then its successor',
      async () => {
        hooks.removing = () => {
          writeFileSync(
            second,
            `---\ntitle: Second tab\nroute: second\n---\n# Second, superseding\n{% include './shared.nunj' %}`,
          );
          events.emit(update(second));
        };
        await put(
          first,
          `---\ntitle: First tab\nroute: first\n---\n# First, superseded\n{% include './shared.nunj' %}`,
        );
      },
      [update(first)],
      2,
    );
    const outputs = Object.keys(await tree(outputRoot));
    missing = outputs.find((file) => file.includes('other') && !file.startsWith('.'))!;
    if (!missing) throw new Error(`No output of the Other page among ${outputs.join(', ')}`);
    await step(
      'externally deleted output, then an edit',
      async () => {
        await rm(path.join(outputRoot, missing));
        await put(
          first,
          `---\ntitle: First tab\nroute: first\n---\n# First after deletion\n{% include './shared.nunj' %}`,
        );
      },
      [update(first)],
    );
    await step(
      'externally modified unchanged output, then an edit',
      async () => {
        await writeFile(path.join(outputRoot, missing), 'EXTERNALLY EDITED');
        await put(
          first,
          `---\ntitle: First tab\nroute: first\n---\n# First after the external edit\n{% include './shared.nunj' %}`,
        );
      },
      [update(first)],
    );
    {
      const from = results.length;
      hooks.reads = [];
      // Nothing changed unseen: the rescan's generation is a reconciling one, with the full commit.
      await session.rescan();
      await until(() => results.length >= from + 1 && !session.inspect().building);
      await record('rescan (full commit)', from);
    }
    await session.dispose();
    const restart = results.length;
    await start();
    await record('committer restart (warm start: development build, full commit)', restart);
    await step(
      'first edit after the restart',
      () =>
        put(
          first,
          `---\ntitle: First tab\nroute: first\n---\n# First after restart\n{% include './shared.nunj' %}`,
        ),
      [update(first)],
    );
    {
      // A production build in the same session: outside the watch, so a full commit.
      const from = results.length;
      hooks.reads = [];
      const production = await session.buildOnce({ mode: 'production' });
      results.push(production);
      await record('production build (full commit)', from);
    }
    await step(
      'edit after the production build',
      () =>
        put(
          first,
          `---\ntitle: First tab\nroute: first\n---\n# First after production\n{% include './shared.nunj' %}`,
        ),
      [update(first)],
    );
    await step(
      'second edit after the production build',
      () =>
        put(
          first,
          `---\ntitle: First tab\nroute: first\n---\n# First after production, again\n{% include './shared.nunj' %}`,
        ),
      [update(first)],
    );
    return steps;
  } finally {
    hooks.removing = undefined;
    hooks.outputRoot = '';
    await session?.dispose().catch(() => undefined);
  }
}

test(
  'delta and full commits leave identical results, manifests and trees at every step',
  { timeout: 240_000 },
  async () => {
    // The committer trusts an unchanged output's stat instead of reading it once the output is
    // older than its racy window (2 s), so how many outputs a commit reads would depend on the
    // machine's speed. The wall clock stands still instead: every output stays inside the window,
    // and each commit reads exactly what its plan reads, on a fast machine and on a slow runner.
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now());
    let full: Step[];
    let delta: Step[];
    try {
      full = await run(false);
      delta = await run(true);
    } finally {
      clock.mockRestore();
    }
    expect(delta.map((item) => item.label)).toEqual(full.map((item) => item.label));
    for (const [index, step] of delta.entries()) {
      const reference = full[index];
      expect({ step: step.label, generations: step.generations }).toEqual({
        step: step.label,
        generations: reference.generations,
      });
      expect({ step: step.label, manifest: step.manifest }).toEqual({
        step: step.label,
        manifest: reference.manifest,
      });
      if (step.label.startsWith('externally modified')) {
        // The documented difference: the delta commit leaves the external edit of an unchanged
        // output; the full commit repairs it. Nothing else differs.
        expect(step.tree[missing]).toBe(sha('EXTERNALLY EDITED'));
        expect(reference.tree[missing]).not.toBe(sha('EXTERNALLY EDITED'));
        expect({ ...step.tree, [missing]: '' }).toEqual({ ...reference.tree, [missing]: '' });
      } else {
        expect({ step: step.label, tree: step.tree }).toEqual({
          step: step.label,
          tree: reference.tree,
        });
      }
      expect(step.generations.every((generation) => generation.status !== 'cancelled')).toBe(true);
    }
    const modes = (steps: Step[]) =>
      steps.map((item) => [
        item.label,
        item.telemetry.map((entry) =>
          entry ? `${entry.mode}${entry.reason ? `:${entry.reason}` : ''}` : 'none',
        ),
      ]);
    const starts = new Set([0, 13]);
    for (const index of starts) {
      expect(delta[index].telemetry.length).toBeGreaterThan(0);
      expect(
        delta[index].telemetry.every(
          (entry) => entry?.mode === 'full' && entry.reason === 'no-base',
        ),
      ).toBe(true);
    }
    expect(modes(delta).filter((_, index) => !starts.has(index))).toEqual([
      // Only targeted generations get a base; a full generation commits in full, so that full
      // generations repair external edits of unchanged outputs. The first edit after a start has no
      // retained index yet and is a full generation.
      ['first edit after the cold start: guide', ['full:no-base']],
      ['include edit', ['delta']],
      // API edits and pages added, renamed and deleted are targeted (the structural class).
      ['API edit', ['delta']],
      ['page added', ['delta']],
      ['page renamed (folder and route)', ['delta']],
      ['page deleted', ['delta']],
      ['failed commit (publish fault, rolled back)', ['delta']],
      ['edit after the failed commit', ['full:no-base']],
      ['commit superseded after publication, then its successor', ['delta', 'delta']],
      ['externally deleted output, then an edit', ['full:no-base']],
      ['externally modified unchanged output, then an edit', ['delta']],
      ['rescan (full commit)', ['full:no-base']],
      ['first edit after the restart', ['delta']],
      ['production build (full commit)', ['full:no-base']],
      // A production snapshot records the global semantic reference, a development one records
      // semantic closures: the first development generation after a production build changes every
      // artifact that queried the program, so it is not a targeted delta. The next one is again.
      ['edit after the production build', ['full:no-base']],
      ['second edit after the production build', ['delta']],
    ]);
    expect(
      modes(full).every(([, entries]) => (entries as string[]).every((entry) => entry === 'full')),
    ).toBe(true);
    // Every step's generations succeeded, except the injected fault; the superseded generation was adopted.
    expect(delta[7].generations.map((item) => item.status)).toEqual(['failure']);
    expect(delta[9].generations.map((item) => [item.status, !!item.superseded])).toEqual([
      ['success', true],
      ['success', false],
    ]);
    expect(
      delta[10].generations[0].whyRebuilt.some((reason) => reason.reason === 'output-missing'),
    ).toBe(true);
    // Cut #4: after a commit that wrote every output, the first targeted edit reads only the
    // outputs of the artifacts it changed; the full commit reads every unchanged output once more.
    const firstEdit = delta[2];
    const fullFirstEdit = full[2];
    const outputs = Object.keys(firstEdit.tree).length;
    expect(fullFirstEdit.reads.length).toBeGreaterThan(outputs / 2);
    expect(firstEdit.reads.length).toBeLessThan(fullFirstEdit.reads.length / 2);
    expect(firstEdit.reads.filter((file) => file.includes('other'))).toEqual([]);
  },
);
