import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ViteDevServer } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createOutputCommitter } from '../../artifacts';
import type {
  ArtifactSnapshot,
  BuildResult,
  CommitGuard,
  CommitRequest,
  CompilationResult,
  FileChange,
  FileEventSource,
  OutputCommitter,
  OutputManifest,
} from '../../contracts';
import { bytesDigest } from '../../kernel/canonical';
import { VITE_MODULELESS_SETTLE_FLAG } from '../../kernel/flags';
import { createBuildSession } from '../../session/build-session';
import { type HostUpdateTicket, HostUpdateCoordinator } from '../host-updates';
import { acquireOutputLease } from '../lease';
import { ViteAdapterLifecycle } from '../lifecycle';

/**
 * Sustained churn: an edit arrives while the previous generation is still in flight, again and
 * again. A module-less hot update (one that hands Vite no module to update, such as an edit of a
 * markdown source Vite never served) has nothing to wait for: its acknowledgment settles its
 * obligations, and the reload is the coordinator's own. Its hook must settle right away instead of
 * following every newer generation until the churn stops. A hot update that hands Vite modules
 * still waits for the newest publication. Either way, and with `NGDOC_VITE_MODULELESS_SETTLE=0`
 * (every hot update waits, as before), the served state after the churn is the one a cold
 * publication of the final sources serves.
 */

const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});

const sha = (value: string) => createHash('sha256').update(value).digest('hex');

/**
 * A new temporary directory, removed after the test.
 */
function directory(): string {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'ngdoc-churn-')));
  roots.push(root);
  return root;
}

interface Tracked {
  settled: boolean;
  error?: unknown;
}

/**
 * Records when a hook's promise settles, without awaiting it.
 * @param promise The hook's settlement.
 */
function track(promise: Promise<unknown>): Tracked {
  const tracked: Tracked = { settled: false };
  promise.then(
    () => {
      tracked.settled = true;
    },
    (error: unknown) => {
      tracked.settled = true;
      tracked.error = error;
    },
  );
  return tracked;
}

/** Lets every pending continuation run (the coordinator's waits are promise chains). */
async function turns(): Promise<void> {
  for (let turn = 0; turn < 20; turn++) await new Promise((resolve) => setImmediate(resolve));
}

/**
 * A manifest whose only output is the search index: no module for Vite to reload.
 * @param generation The generation that committed it.
 */
function searchManifest(generation: number): OutputManifest {
  return {
    schemaVersion: 1,
    projectId: 'test',
    generation,
    revision: `r${generation}`,
    files: [
      {
        path: 'assets/ng-doc/indexes.json',
        digest: sha(`index ${generation}`),
        role: 'search',
        ownerId: 'aggregate:test',
      },
    ],
  };
}

/**
 * @param generation The committed generation.
 */
function success(generation: number): Extract<BuildResult, { status: 'success' }> {
  return {
    status: 'success',
    generation,
    snapshot: {
      projectId: 'test',
      revision: `r${generation}`,
      artifacts: [],
      globalKeywords: [],
      remoteKeywords: [],
    },
    manifest: searchManifest(generation),
    diagnostics: [],
    whyRebuilt: [],
  };
}

interface ChurnOutcome {
  /** After each round: how many module-less hooks had settled, and how many with modules. */
  rounds: Array<{ moduleless: number; modules: number }>;
  /** Reloads sent while the churn lasted, and in all. */
  reloadsDuringChurn: number;
  reloads: number;
  announced?: OutputManifest;
  errors: unknown[];
  blockers: number;
}

/**
 * Drives one coordinator through `rounds` edits, each started while the previous generation is in
 * flight; the previous one's result lands meanwhile and is never published (a newer generation
 * started: the host skips it, or the session cancelled it). Every edit is reported twice: as a
 * markdown source Vite has no module for, and as a data file the application imports.
 * @param rounds How many edits the churn makes.
 */
async function churn(rounds: number): Promise<ChurnOutcome> {
  const root = directory();
  const output = path.join(root, 'out');
  const page = path.join(root, 'docs/page.md');
  const data = path.join(root, 'docs/data.json');
  const notify = vi.fn();
  const fail = vi.fn();
  const coordinator = new HostUpdateCoordinator(notify, fail);
  coordinator.seed(output, searchManifest(1));
  const moduleless: Tracked[] = [];
  const modules: Tracked[] = [];
  const outcome: ChurnOutcome = {
    rounds: [],
    reloadsDuringChurn: 0,
    reloads: 0,
    errors: [],
    blockers: 0,
  };
  const last = rounds + 1;
  for (let generation = 2; generation <= last; generation++) {
    const markdown = coordinator.begin(page, 'update', () => `page ${generation}`, true);
    const json = coordinator.begin(data, 'update', () => `data ${generation}`, true);
    coordinator.started(generation, [
      { kind: 'update', path: page },
      { kind: 'update', path: data },
    ]);
    if (generation > 2) {
      const previous = generation - 1;
      if (previous % 2 === 0) {
        coordinator.result(success(previous));
        coordinator.publication(previous, 'skipped');
      } else {
        coordinator.result({
          status: 'cancelled',
          generation: previous,
          diagnostics: [],
          whyRebuilt: [],
        });
        coordinator.publication(previous, 'cancelled');
      }
    }
    for (const ticket of [markdown, json]) {
      await ticket.ready;
      await coordinator.acknowledge(ticket);
    }
    moduleless.push(track(coordinator.settle(markdown, false)));
    modules.push(track(coordinator.settle(json)));
    await turns();
    outcome.rounds.push({
      moduleless: moduleless.filter((hook) => hook.settled).length,
      modules: modules.filter((hook) => hook.settled).length,
    });
  }
  outcome.reloadsDuringChurn = notify.mock.calls.length;
  // The churn stops: the newest generation is published.
  const final = success(last);
  coordinator.result(final);
  coordinator.published(final, false);
  await turns();
  outcome.reloads = notify.mock.calls.length;
  outcome.announced = (
    coordinator as unknown as { announcedManifest?: OutputManifest }
  ).announcedManifest;
  outcome.errors = [...moduleless, ...modules]
    .filter((hook) => !hook.settled || hook.error !== undefined)
    .map((hook) => hook.error ?? 'pending');
  outcome.blockers = coordinator.blockerCount();
  expect(fail).not.toHaveBeenCalled();
  coordinator.dispose();
  return outcome;
}

const ROUNDS = 12;

/**
 * Turns the module-less settlement off for the coordinators created afterwards.
 * @param on Whether it stays on (the default).
 */
function moduleless(on: boolean): void {
  if (!on) vi.stubEnv(VITE_MODULELESS_SETTLE_FLAG, '0');
}

describe('host updates under sustained churn', () => {
  it('settles each module-less hot update in its own round, while module updates wait for the newest publication', async () => {
    const outcome = await churn(ROUNDS);
    // Each module-less hook settled in the round it began, while newer generations kept starting.
    expect(outcome.rounds.map((round) => round.moduleless)).toEqual(
      Array.from({ length: ROUNDS }, (_, index) => index + 1),
    );
    // A hook that hands Vite modules still follows every newer generation.
    expect(outcome.rounds.map((round) => round.modules)).toEqual(Array(ROUNDS).fill(0));
    // No reload before the newest generation is published, and exactly one after it.
    expect(outcome.reloadsDuringChurn).toBe(0);
    expect(outcome.reloads).toBe(1);
    expect(outcome.announced).toEqual(searchManifest(ROUNDS + 1));
    expect(outcome.errors).toEqual([]);
    expect(outcome.blockers).toBe(0);
  });

  it(`waits for the newest publication with ${VITE_MODULELESS_SETTLE_FLAG}=0, and ends in the same state`, async () => {
    const on = await churn(ROUNDS);
    moduleless(false);
    const off = await churn(ROUNDS);
    // As before the switch: no hook settles while the churn lasts.
    expect(off.rounds).toEqual(Array(ROUNDS).fill({ moduleless: 0, modules: 0 }));
    // Only the latency differs: the same reloads, the same announced state, every hook settled.
    expect({ ...off, rounds: [] }).toEqual({ ...on, rounds: [] });
  });

  it('reports a recoverable diagnostic to a module-less hook at once', async () => {
    const root = directory();
    const coordinator = new HostUpdateCoordinator(vi.fn(), vi.fn());
    coordinator.seed(path.join(root, 'out'), searchManifest(1));
    const broken = coordinator.begin(path.join(root, 'broken.ts'), 'update', () => '', false);
    const diagnostic = new Error('invalid component');
    coordinator.diagnostic(broken, diagnostic);
    // A generation is in flight, so a hook that waited would not settle yet.
    coordinator.started(2, []);
    const page = coordinator.begin(path.join(root, 'docs/page.md'), 'update', () => '', false);
    await coordinator.acknowledge(page);
    await expect(coordinator.settle(page, false)).rejects.toBe(diagnostic);
    coordinator.dispose();
    await expect(coordinator.settle(page, false)).resolves.toBeUndefined();
  });

  it.each([true, false])(
    'keeps the reload a claimed TypeScript update asks for when its generation is not published (module-less settlement %s)',
    async (on) => {
      moduleless(on);
      const root = directory();
      const notify = vi.fn();
      const coordinator = new HostUpdateCoordinator(notify, vi.fn());
      coordinator.seed(path.join(root, 'out'), searchManifest(1));
      const component = path.join(root, 'docs/demo.component.ts');
      const ticket = coordinator.begin(component, 'update', () => 'class Demo {}', true);
      coordinator.started(2, [{ kind: 'update', path: component }]);
      await ticket.ready;
      await coordinator.acknowledge(ticket, false, true);
      const hook = track(coordinator.settle(ticket, false));
      await turns();
      expect(hook.settled).toBe(on);
      // A newer edit supersedes generation 2, which the session cancels; generation 3 publishes
      // the same outputs (nothing of its own to reload), so only the update's request reloads.
      coordinator.started(3, []);
      coordinator.result({ status: 'cancelled', generation: 2, diagnostics: [], whyRebuilt: [] });
      coordinator.publication(2, 'cancelled');
      await turns();
      expect(notify).not.toHaveBeenCalled();
      const unchanged = { ...success(3), manifest: searchManifest(1) };
      coordinator.result(unchanged);
      coordinator.published(unchanged, false);
      await turns();
      expect(hook).toEqual({ settled: true });
      expect(notify).toHaveBeenCalledOnce();
      coordinator.dispose();
    },
  );

  it('asks for no reload after a diagnostic or after disposal, as the wait did not', async () => {
    const root = directory();
    const notify = vi.fn();
    const coordinator = new HostUpdateCoordinator(notify, vi.fn());
    coordinator.seed(path.join(root, 'out'), searchManifest(1));
    const update = async (generation: number, name: string) => {
      const file = path.join(root, `docs/${name}.component.ts`);
      const ticket = coordinator.begin(file, 'update', () => name, true);
      coordinator.started(generation, [{ kind: 'update', path: file }]);
      await ticket.ready;
      await coordinator.acknowledge(ticket, false, true);
      await coordinator.settle(ticket, false);
    };
    const pending = () =>
      (coordinator as unknown as { pendingGeneration?: number }).pendingGeneration;
    await update(2, 'diagnosed');
    const broken = coordinator.begin(path.join(root, 'broken.ts'), 'update', () => '', false);
    coordinator.diagnostic(broken, new Error('invalid component'));
    coordinator.publication(2, 'skipped');
    await turns();
    expect(pending()).toBeUndefined();
    await coordinator.acknowledge(
      coordinator.begin(path.join(root, 'fixed.ts'), 'update', () => '', false),
      false,
      true,
    );
    expect(coordinator.diagnosticError()).toBeUndefined();
    notify.mockClear();
    await update(3, 'disposed');
    coordinator.dispose();
    await turns();
    expect(notify).not.toHaveBeenCalled();
  });
});

class Events implements FileEventSource {
  listener?: (events: FileChange[]) => unknown;
  async subscribe(listener: (events: FileChange[]) => unknown) {
    this.listener = listener;
    return { dispose: async () => {} };
  }
  emit(...events: FileChange[]) {
    this.listener?.(events);
  }
}

interface Served {
  /** The committed outputs: every file below the output root but the commit internals. */
  files: Record<string, string>;
  /** What the committed manifest lists, without its generation number. */
  manifest: Pick<OutputManifest, 'files' | 'revision'>;
}

/**
 * The served state of an output root: its files and its manifest, without the generation number
 * (a cold build counts its generations from one).
 * @param output The output root.
 */
function served(output: string): Served {
  const files: Record<string, string> = {};
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
      left.name < right.name ? -1 : 1,
    )) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.name !== '.ng-doc-output-manifest.json')
        files[path.relative(output, absolute).replace(/\\/g, '/')] = readFileSync(absolute, 'utf8');
    }
  };
  walk(output);
  const manifest = JSON.parse(
    readFileSync(path.join(output, '.ng-doc-output-manifest.json'), 'utf8'),
  ) as OutputManifest;
  return { files, manifest: { files: manifest.files, revision: manifest.revision } };
}

/**
 * The compiler of a one-page site: `docs/a.md` becomes `pages/a.mjs`, a module the application
 * imports. It reads the source afresh in every generation.
 * @param root The site root.
 * @param output The output root.
 */
function pageCompiler(root: string, output: string) {
  const source = path.join(root, 'docs/a.md');
  const configuration = {
    outputRoot: output,
    cacheRoot: path.join(root, 'cache'),
    assetDirectory: 'assets',
    themes: { light: 'github-light', dark: 'ayu-dark' },
    digest: 'configuration',
  };
  const module = (body: string) => `export default ${JSON.stringify(body)};\n`;
  const snapshot = (body: string): ArtifactSnapshot => ({
    configuration,
    projectId: 'project',
    revision: body,
    artifacts: [
      {
        id: 'a',
        identity: { projectId: 'project', entryId: 'a', role: 'content' },
        revision: body,
        fingerprint: {
          schemaVersion: 4,
          compilerVersion: 'compiler',
          toolchainDigest: 'toolchain',
          configurationDigest: 'configuration',
          inputDigest: body,
          keywordDigest: 'keywords',
        },
        dependencies: [],
        content: [],
        exportedKeywords: [],
        usedKeywords: [],
        searchRecords: [],
        routes: [],
        apiList: [],
        outputs: [
          {
            path: 'pages/a.mjs',
            role: 'content',
            encoding: 'utf8',
            content: module(body),
            digest: sha(module(body)),
          },
        ],
        diagnostics: [],
      },
    ],
    globalKeywords: [],
    remoteKeywords: [],
  });
  return {
    configuration,
    source,
    compiler: {
      async compile(): Promise<CompilationResult> {
        const bytes = readFileSync(source);
        return {
          candidate: snapshot(bytes.toString('utf8')),
          dependencies: [{ kind: 'content', path: source, digest: bytesDigest(bytes) }],
          diagnostics: [],
          whyRebuilt: [],
        };
      },
      async dispose() {},
    },
  };
}

/**
 * A cold publication of the site's current sources into a fresh output root.
 * @param root The site root, whose `docs/a.md` holds the final source.
 */
async function cold(root: string): Promise<Served> {
  const output = path.join(root, 'cold');
  mkdirSync(output);
  const { compiler } = pageCompiler(root, output);
  const committer = createOutputCommitter({ outputRoot: output });
  const session = createBuildSession({ compiler, committer });
  const result = await session.buildOnce({ mode: 'development' });
  expect(result.status).toBe('success');
  await session.dispose();
  return served(output);
}

interface HostOutcome {
  served: Served;
  announced?: OutputManifest;
  /** The module-less hooks that had settled when the churn's last edit arrived. */
  settledBeforeLastEdit: number;
  edits: number;
}

/**
 * The real lifecycle, session and transactional committer under churn: each commit's writes are
 * reported as Vite's watcher reports them, and while the commit is in flight the next edit of
 * `docs/a.md` arrives, with its own (module-less) hot update, until `edits` edits were made.
 * @param edits How many edits the churn makes.
 */
async function hostChurn(edits: number): Promise<HostOutcome & { root: string }> {
  const root = directory();
  const output = path.join(root, 'out');
  mkdirSync(output);
  mkdirSync(path.join(root, 'docs'));
  const { configuration, source, compiler } = pageCompiler(root, output);
  writeFileSync(source, 'edit 0');
  const sends: Array<{ type: string }> = [];
  const server = {
    config: { logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } },
    ws: { send: (payload: { type: string }) => sends.push(payload) },
    watcher: { emit: vi.fn() },
  } as unknown as ViteDevServer;
  const lifecycle = new ViteAdapterLifecycle(acquireOutputLease(`churn-${Date.now()}`, output));
  lifecycle.attachServer(server, undefined as never);
  const events = new Events();
  const hooks: Tracked[] = [];
  let made = 0;
  let settledBeforeLastEdit = -1;
  const edit = () => {
    made += 1;
    if (made === edits) settledBeforeLastEdit = hooks.filter((hook) => hook.settled).length;
    writeFileSync(source, `edit ${made}`);
    // Vite has no module for the markdown source: its hot update hands Vite nothing.
    const ticket: HostUpdateTicket = lifecycle.hostUpdateStarted(source, 'update', () =>
      readFileSync(source, 'utf8'),
    );
    hooks.push(
      track(
        lifecycle
          .hostUpdateAcknowledged(ticket)
          .then(() => lifecycle.hostUpdateSettled(ticket, false)),
      ),
    );
    events.emit({ kind: 'update', path: source });
  };
  const real = createOutputCommitter({ outputRoot: output });
  let watching = false;
  const committer: OutputCommitter = {
    async commit(request: CommitRequest, guard: CommitGuard, signal: AbortSignal) {
      const result = await real.commit(request, guard, signal);
      if (result.status === 'committed' && watching) {
        // The Vite watcher reports the page module the commit wrote; the application imports it.
        for (const relative of result.written) {
          const file = path.join(output, relative);
          const ticket = lifecycle.hostUpdateStarted(file, 'update', () =>
            readFileSync(file, 'utf8'),
          );
          void lifecycle.hostUpdateCompleted(ticket).catch(() => undefined);
        }
        // The next edit arrives while this generation's publication is still in flight.
        if (made < edits) edit();
      }
      return result;
    },
    dispose: () => real.dispose(),
  };
  const session = createBuildSession({ compiler, committer }, { batchDelayMs: 0 });
  lifecycle.attachSession(session);
  lifecycle.publish(
    lifecycle.acceptInitial(await session.buildOnce({ mode: 'development' })),
    configuration,
  );
  const results: BuildResult[] = [];
  const observe = lifecycle.observer(() => configuration);
  const watch = await session.watch(events, (event) => {
    if (event.kind === 'result') results.push(event.result);
    observe(event);
  });
  lifecycle.attachWatch(watch);
  expect((await watch.initial).status).toBe('success');
  await lifecycle.settled();
  watching = true;
  const coordinator = (lifecycle as unknown as { hostUpdates: HostUpdateCoordinator }).hostUpdates;
  edit();
  // The churn stops after the last edit: its generation is published, and every hook settles.
  await vi.waitFor(
    async () => {
      await lifecycle.settled();
      const latest = results.at(-1);
      expect(latest?.status === 'success' && latest.manifest.revision).toBe(`edit ${edits}`);
      expect(hooks.every((hook) => hook.settled)).toBe(true);
      expect(coordinator.blockerCount()).toBe(0);
      expect(sends.at(-1)).toEqual({ type: 'full-reload' });
    },
    { timeout: 20_000 },
  );
  expect(hooks.filter((hook) => hook.error !== undefined)).toEqual([]);
  expect(lifecycle.failure).toBeUndefined();
  const announced = (coordinator as unknown as { announcedManifest?: OutputManifest })
    .announcedManifest;
  await watch.dispose();
  await lifecycle.dispose();
  await session.dispose();
  return { root, served: served(output), announced, settledBeforeLastEdit, edits: made };
}

describe('host updates under sustained churn, through the real session and committer', () => {
  const outcomes = new Map<boolean, Served>();

  it.each([true, false])(
    'serves what a cold publication of the final sources serves (module-less settlement %s)',
    async (on) => {
      moduleless(on);
      const outcome = await hostChurn(ROUNDS);
      expect(outcome.edits).toBe(ROUNDS);
      // Every earlier edit's module-less hook settled before the churn's last edit arrived. With
      // the switch off they wait for the newest publication, which a pause between two of the
      // session's generations may let happen, so their count is left open.
      if (on) expect(outcome.settledBeforeLastEdit).toBe(ROUNDS - 1);
      const reference = await cold(outcome.root);
      expect(outcome.served).toEqual(reference);
      expect(outcome.announced?.files).toEqual(reference.manifest.files);
      expect(outcome.announced?.revision).toBe(reference.manifest.revision);
      outcomes.set(on, outcome.served);
      // The switch changes when the hooks settle, never what is served.
      if (outcomes.size === 2) expect(outcomes.get(false)).toEqual(outcomes.get(true));
    },
    30_000,
  );
});
