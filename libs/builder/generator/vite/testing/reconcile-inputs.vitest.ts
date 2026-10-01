import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { type FSWatcher, type Plugin, type ViteDevServer, createServer } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  BuildEvent,
  BuildResult,
  BuildSession,
  CompilationRequest,
  Dependency,
  Diagnostic,
} from '../../contracts';
import { createBuildSession } from '../../session/build-session';
import { WATCHER_RESCAN } from '../../session/watch-signals';
import { createNgDocVitePlugin } from '..';
import { qualifyAngularPlugins } from '../angular-compatibility';
import type { HostUpdateCoordinator } from '../host-updates';
import { acquireOutputLease } from '../lease';
import { ViteAdapterLifecycle } from '../lifecycle';
import {
  type WatchObservation,
  MAX_RETAINED_REJECTIONS,
  ViteFileEventSource,
} from '../vite-event-source';

/**
 * After a generation records a new input, the Vite host re-observes only what may have changed
 * unseen (the new physical watch targets and the rejected changes they now match), once their
 * watches are attached, against what the session last observed. A difference is an ordinary
 * `filesystem` change; when nothing differs no generation runs. A full `reconcile` generation here
 * would discard the retained program and hold back the reload of the edit that added the input.
 * A superseded success never reconciles: the generation that superseded it re-verifies its
 * inputs. Lossy-watcher rescans and lost-watch failures keep their own, unchanged recovery. When
 * the rejections overflow, the paths are unknown, and the host asks the session for the same
 * rescan a lossy watcher triggers.
 */

/** Fault injection: runs once while the committer removes a stage directory. */
const stage = vi.hoisted(() => ({ removing: undefined as undefined | (() => Promise<void>) }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    rm: async (...args: Parameters<typeof actual.rm>) => {
      const hook = stage.removing;
      if (hook && String(args[0]).includes('.ng-doc-stage-')) {
        stage.removing = undefined;
        await hook();
      }
      return actual.rm(...args);
    },
  };
});

const repository = path.resolve(import.meta.dirname, '../../../../..');
const temporary: string[] = [];
const servers: ViteDevServer[] = [];
const cleanups: Array<() => unknown> = [];

afterEach(async () => {
  stage.removing = undefined;
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  await Promise.allSettled(servers.splice(0).map((server) => server.close()));
  await Promise.all(temporary.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const normalize = (value: string) => path.resolve(value).replace(/\\/g, '/');

async function directory(prefix: string): Promise<string> {
  const runtime = path.join(import.meta.dirname, '.runtime');
  await mkdir(runtime, { recursive: true });
  const root = realpathSync(await mkdtemp(path.join(runtime, prefix)));
  temporary.push(root);
  return root;
}

class FakeWatcher extends EventEmitter {
  readonly added: string[] = [];
  readonly close = vi.fn(async () => {});
  readonly unwatch = vi.fn(async () => {});

  add(values: string | readonly string[]): this {
    this.added.push(...(typeof values === 'string' ? [values] : values));
    return this;
  }
}

/** A watcher that lists an added path in `getWatched()` only once the test attaches it. */
class AttachingWatcher extends FakeWatcher {
  private readonly attachedPaths = new Set<string>();

  attach(target: string): void {
    this.attachedPaths.add(target);
  }

  getWatched(): Record<string, string[]> {
    const watched: Record<string, string[]> = {};
    for (const target of this.attachedPaths) {
      (watched[path.dirname(target)] ??= []).push(path.basename(target));
    }
    return watched;
  }
}

/** An `fs` failure shaped like the ones chokidar re-emits. */
function fsError(code: string, syscall: string, target: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`${code}: simulated failure, ${syscall} '${target}'`), {
    code,
    errno: -1,
    syscall,
    path: target,
  });
}

function configuration(root: string) {
  return {
    outputRoot: root,
    cacheRoot: path.join(root, 'cache'),
    assetDirectory: 'assets',
    themes: { light: 'github-light', dark: 'ayu-dark' },
    digest: digest(root),
  };
}

interface Generation {
  generation: number;
  origin?: string;
  changes: string[];
}

interface RigOptions {
  /** Record a glob rooted at the workspace root, as an API scope does. */
  glob?: boolean;
  /**
   * Hold every later generation, and every event after this generation's result, until the
   * lifecycle has processed that result: the superseding generation then deterministically starts
   * after the observation of the superseded one.
   */
  pauseAfter?: number;
  watcher?: FakeWatcher;
}

/**
 * A Vite dev host without Vite: the real session, event source, lifecycle and host-update
 * coordinator, with a fake chokidar watcher. `page` is always read; `snippet` only while the page
 * body contains "include". A missing snippet, or one containing "broken", fails the generation,
 * as a missing or broken include does. Every commit changes the search index, so every
 * publication requests a browser reload.
 */
async function rig(options: RigOptions = {}) {
  const root = await directory('ng-doc-reobserve-');
  const output = path.join(root, 'out');
  const page = path.join(root, 'docs/page.md');
  const snippet = path.join(root, 'snippets/snippet.md');
  await mkdir(path.dirname(page), { recursive: true });
  await mkdir(path.dirname(snippet), { recursive: true });
  await mkdir(output, { recursive: true });
  const api = path.join(root, 'api/unique.ts');
  if (options.glob) {
    await mkdir(path.dirname(api), { recursive: true });
    await writeFile(api, 'export const unique = 1;');
  }
  let paused: Promise<void> | undefined;
  let gate: Promise<void> | undefined;
  let reading: (() => void) | undefined;
  const hooks: { commit?: () => Promise<void> } = {};
  const generations: Generation[] = [];
  const commits: string[] = [];
  /** Per commit: `delta` when it named a base snapshot, `full` otherwise. */
  const commitKinds: string[] = [];
  const compile = vi.fn(async (request: CompilationRequest) => {
    generations.push({
      generation: request.generation,
      ...(request.contentRequest ? { origin: request.contentRequest.origin } : {}),
      changes: request.changes.map((change) => `${change.kind}:${change.path}`),
    });
    if (options.pauseAfter !== undefined && request.generation > options.pauseAfter) {
      await paused;
    }
    const body = await readFile(page, 'utf8');
    const dependencies: Dependency[] = [{ kind: 'content', path: page, digest: digest(body) }];
    if (options.glob) {
      dependencies.push({
        kind: 'glob',
        root,
        include: ['api/**/*.ts'],
        exclude: [],
        members: [api],
      });
    }
    const diagnostics: Diagnostic[] = [];
    let included = '';
    if (body.includes('include')) {
      if (existsSync(snippet)) {
        included = await readFile(snippet, 'utf8');
        dependencies.push({ kind: 'content', path: snippet, digest: digest(included) });
        if (included.includes('broken')) {
          diagnostics.push({
            code: 'BROKEN_INCLUDE',
            severity: 'error',
            stage: 'content',
            message: `Broken include ${snippet}`,
          });
        }
      } else {
        dependencies.push({ kind: 'existence', path: snippet, exists: false });
        diagnostics.push({
          code: 'MISSING_INCLUDE',
          severity: 'error',
          stage: 'content',
          message: `Missing include ${snippet}`,
        });
      }
      const held = gate;
      gate = undefined;
      reading?.();
      reading = undefined;
      await held;
    }
    return {
      candidate: {
        projectId: 'test',
        revision: `${request.generation}:${body}|${included}`,
        artifacts: [],
        globalKeywords: [],
        remoteKeywords: [],
      },
      dependencies,
      diagnostics,
      whyRebuilt: [],
    };
  });
  const session = createBuildSession(
    {
      compiler: { compile, dispose: async () => {} },
      committer: {
        commit: async (request) => {
          const hook = hooks.commit;
          hooks.commit = undefined;
          await hook?.();
          commits.push(request.candidate.revision);
          commitKinds.push(request.base ? 'delta' : 'full');
          return {
            status: 'committed',
            manifest: {
              schemaVersion: 1,
              projectId: 'test',
              generation: request.generation,
              revision: request.candidate.revision,
              files: [
                {
                  path: 'indexes.json',
                  ownerId: 'index',
                  digest: digest(request.candidate.revision),
                  role: 'search',
                },
              ],
            },
            written: [],
            removed: [],
            diagnostics: [],
          };
        },
        dispose: async () => {},
      },
    },
    { batchDelayMs: 0 },
  );
  // What the lifecycle asked the session for: a re-observation of the new inputs, or a rescan of
  // every committed input.
  const reobserved: string[][] = [];
  const reconcileInputs = session.reconcileInputs.bind(session);
  Object.assign(session, {
    reconcileInputs: (paths: readonly string[]) => {
      reobserved.push([...paths]);
      return reconcileInputs(paths);
    },
  });
  const rescans = vi.spyOn(session, 'rescan');
  const watcher = options.watcher ?? new FakeWatcher();
  const source = new ViteFileEventSource(watcher as unknown as FSWatcher, 100);
  source.excludeOwned(output);
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
  /** Each browser reload, with the number of generations compiled when it was sent. */
  const reloads: number[] = [];
  const send = vi.fn((message: { type: string }) => {
    if (message.type === 'full-reload') reloads.push(generations.length);
  });
  const server = { config: { logger }, ws: { send } } as unknown as ViteDevServer;
  const lifecycle = new ViteAdapterLifecycle(
    acquireOutputLease(`reobserve-${Date.now()}-${Math.random()}`, output),
  );
  lifecycle.attachServer(server, source);
  lifecycle.attachSession(session);
  // Every successful publication must go through `published()`, which owns the single browser
  // reload; a direct `publication(g, 'success')` would lose it.
  const coordinator = (lifecycle as unknown as { hostUpdates: HostUpdateCoordinator }).hostUpdates;
  const published: number[] = [];
  const directSuccess: number[] = [];
  const publishedOf = coordinator.published.bind(coordinator);
  const publicationOf = coordinator.publication.bind(coordinator);
  coordinator.published = (result, recovered) => {
    published.push(result.generation);
    publishedOf(result, recovered);
  };
  coordinator.publication = (generation, status, error) => {
    if (status === 'success' && !published.includes(generation)) directSuccess.push(generation);
    publicationOf(generation, status, error);
  };
  const diagnostics: Diagnostic[] = [];
  const results: BuildResult[] = [];
  const observer = lifecycle.observer(() => configuration(output));
  const start = async () => {
    const built = await session.buildOnce({ mode: 'development' });
    if (built.status !== 'success') throw new Error('Expected an initial success');
    lifecycle.publish(built, configuration(output));
    await source.seed(built.generation, built.watchInputs);
    const deliver = (event: BuildEvent) => {
      if (event.kind === 'diagnostic') diagnostics.push(event.diagnostic);
      if (event.kind === 'result') results.push(event.result);
      observer(event);
    };
    const watch = await session.watch(source, (event) => {
      if (paused) {
        paused = paused.then(() => deliver(event));
        return;
      }
      deliver(event);
      if (
        event.kind === 'result' &&
        options.pauseAfter !== undefined &&
        event.result.generation === options.pauseAfter
      ) {
        paused = lifecycle.settled();
      }
    });
    lifecycle.attachWatch(watch);
    await watch.initial;
    await lifecycle.settled();
  };
  /** Writes a file and reports it the way Vite's hotUpdate hooks do. */
  const edit = async (file: string, body: string, kind: 'update' | 'create' = 'update') => {
    await writeFile(file, body);
    const ticket = lifecycle.hostUpdateStarted(file, kind, () => body);
    void lifecycle.hostUpdateAcknowledged(ticket).catch(() => {});
  };
  /** Arms the gate: the next generation that reads the snippet waits until `release`. */
  const hold = () => {
    let release!: () => void;
    gate = new Promise<void>((resolve) => (release = resolve));
    const read = new Promise<void>((resolve) => (reading = resolve));
    return { read, release };
  };
  /** No generation, result or re-observation for `quiet` ms. */
  const quiescent = async (quiet = 300) => {
    let key = '';
    let since = Date.now();
    for (const deadline = Date.now() + 10_000; ; ) {
      await lifecycle.settled();
      const current = `${generations.length}/${results.length}/${reobserved.length}`;
      if (current !== key) {
        key = current;
        since = Date.now();
      } else if (Date.now() - since >= quiet) return;
      if (Date.now() > deadline) throw new Error('Did not settle');
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  };
  cleanups.push(async () => {
    await lifecycle.settled();
    await lifecycle.dispose();
  });
  return {
    root,
    page,
    snippet,
    api,
    watcher,
    session,
    source,
    lifecycle,
    hooks,
    generations,
    commits,
    commitKinds,
    reobserved,
    rescans,
    reloads,
    published,
    directSuccess,
    diagnostics,
    results,
    start,
    edit,
    hold,
    quiescent,
  };
}

describe('a new input is re-observed, not reconciled by a generation', () => {
  it('runs no extra generation and sends the reload of the edit that added an unchanged input', async () => {
    const r = await rig();
    await writeFile(r.page, 'v1');
    await writeFile(r.snippet, 'snippet v1');
    await r.start();
    expect(r.generations).toEqual([{ generation: 1, changes: [] }]);
    const reloads = r.reloads.length;

    await r.edit(r.page, 'v2 include');
    await vi.waitFor(() => expect(r.commits).toContain('2:v2 include|snippet v1'));
    await r.quiescent();
    // One ordinary filesystem generation; the new input was re-observed and had not changed.
    expect(r.generations.slice(1)).toEqual([
      { generation: 2, origin: 'filesystem', changes: [`update:${r.page}`] },
    ]);
    expect(r.reobserved).toEqual([[r.snippet]]);
    expect(r.rescans).not.toHaveBeenCalled();
    // Exactly one reload, sent while generation 2 was the newest: nothing held it back. It came
    // from `published()`.
    expect(r.reloads.slice(reloads)).toEqual([2]);
    expect(r.published).toEqual([1, 2]);
    expect(r.directSuccess).toEqual([]);

    // Later edits of the (now watched) input are ordinary filesystem generations.
    await r.edit(r.snippet, 'snippet v2');
    await vi.waitFor(() => expect(r.commits).toContain('3:v2 include|snippet v2'));
    await r.quiescent();
    expect(r.generations.slice(2)).toEqual([
      { generation: 3, origin: 'filesystem', changes: [`update:${r.snippet}`] },
    ]);
    expect(r.reobserved).toHaveLength(1);
  }, 20_000);

  it('turns an unseen change of the new input into a filesystem change, never a reconcile generation', async () => {
    const r = await rig();
    await writeFile(r.page, 'v1');
    await writeFile(r.snippet, 'snippet v1');
    await r.start();

    const held = r.hold();
    await r.edit(r.page, 'v2 include');
    await held.read;
    // Generation 2 has read snippet v1. The snippet changes before anything watches it, and no
    // event is reported for it at all.
    await writeFile(r.snippet, 'snippet v2');
    held.release();
    await vi.waitFor(() => expect(r.commits).toContain('3:v2 include|snippet v2'));
    await r.quiescent();
    expect(r.commits).toEqual(['1:v1|', '2:v2 include|snippet v1', '3:v2 include|snippet v2']);
    expect(r.generations.slice(1)).toEqual([
      { generation: 2, origin: 'filesystem', changes: [`update:${r.page}`] },
      { generation: 3, origin: 'filesystem', changes: [`update:${r.snippet}`] },
    ]);
    expect(r.rescans).not.toHaveBeenCalled();
  }, 20_000);

  it('replays an edit rejected while the recording generation ran as a filesystem change', async () => {
    const r = await rig();
    await writeFile(r.page, 'v1');
    await writeFile(r.snippet, 'snippet v1');
    const other = path.join(r.root, 'docs/other.md');
    await r.start();

    const held = r.hold();
    await r.edit(r.page, 'v2 include');
    await held.read;
    // Rejected (not an input yet) while generation 2 runs, and retained; so is an unrelated file.
    await r.edit(r.snippet, 'snippet v2');
    await r.edit(other, 'unrelated', 'create');
    held.release();
    await vi.waitFor(() => expect(r.commits).toContain('3:v2 include|snippet v2'));
    await r.quiescent();
    // The snippet is both a new target and a replayed rejection: re-observed once.
    expect(r.reobserved).toEqual([[r.snippet]]);
    expect(r.generations.slice(2)).toEqual([
      { generation: 3, origin: 'filesystem', changes: [`update:${r.snippet}`] },
    ]);
    expect(r.rescans).not.toHaveBeenCalled();
  }, 20_000);

  it('compares a new input of a failed generation with what that generation read', async () => {
    const r = await rig();
    await writeFile(r.page, 'v1');
    await r.start();

    // The include is missing: generation 2 fails and records the missing snippet. It is still
    // missing, which is what generation 2 read, so nothing runs again.
    await r.edit(r.page, 'v2 include');
    await vi.waitFor(() => expect(r.lifecycle.failure?.message).toContain('Missing include'));
    await r.quiescent();
    expect(r.generations.slice(1)).toEqual([
      { generation: 2, origin: 'filesystem', changes: [`update:${r.page}`] },
    ]);
    expect(r.reobserved).toEqual([[r.snippet]]);
    expect(r.rescans).not.toHaveBeenCalled();

    // Creating it is an ordinary watched change that recovers.
    await r.edit(r.snippet, 'snippet v1', 'create');
    await vi.waitFor(() => expect(r.commits).toContain('3:v2 include|snippet v1'));
    await r.quiescent();
    expect(r.lifecycle.failure).toBeUndefined();
    expect(r.generations).toHaveLength(3);
  }, 20_000);

  it('recovers a fix of a broken new include made while the failing generation ran, beside a workspace-rooted glob', async () => {
    const r = await rig({ glob: true });
    await writeFile(r.page, 'v1');
    await writeFile(r.snippet, 'broken');
    await r.start();

    const held = r.hold();
    await r.edit(r.page, 'v2 include');
    await held.read;
    // Generation 2 has read the broken snippet. The fix is rejected (not an input yet) and
    // retained. The glob rooted above the snippet records membership only, never its content.
    await r.edit(r.snippet, 'fixed');
    held.release();
    await vi.waitFor(() => expect(r.commits).toContain('3:v2 include|fixed'));
    await r.quiescent();
    expect(r.lifecycle.failure).toBeUndefined();
    expect(r.generations.slice(1)).toEqual([
      { generation: 2, origin: 'filesystem', changes: [`update:${r.page}`] },
      { generation: 3, origin: 'filesystem', changes: [`update:${r.snippet}`] },
    ]);
    expect(r.rescans).not.toHaveBeenCalled();
  }, 20_000);

  it('re-observes a new input only once its watch is attached', async () => {
    const watcher = new AttachingWatcher();
    const r = await rig({ watcher });
    await writeFile(r.page, 'v1');
    await writeFile(r.snippet, 'snippet v1');
    await r.start();

    await r.edit(r.page, 'v2 include');
    await vi.waitFor(() => expect(watcher.added).toContain(r.snippet));
    // The watch is not attached yet: a change now would be reported by nothing, so it must be
    // found by the re-observation that follows the attachment.
    await writeFile(r.snippet, 'snippet v2');
    watcher.attach(r.snippet);
    await vi.waitFor(() => expect(r.commits).toContain('3:v2 include|snippet v2'));
    await r.quiescent();
    expect(r.generations.at(-1)).toEqual({
      generation: 3,
      origin: 'filesystem',
      changes: [`update:${r.snippet}`],
    });
  }, 20_000);
});

describe('a superseded success does not reconcile', () => {
  it('leaves the new input to the generation that superseded it', async () => {
    // Generation 3 and its events wait until the lifecycle has processed generation 2, so the
    // lifecycle sees generation 2 as current: the window in which it could reconcile.
    const r = await rig({ pauseAfter: 2 });
    await writeFile(r.page, 'v1');
    await writeFile(r.snippet, 'snippet v1');
    await r.start();

    // Generation 2 records the snippet; a page edit supersedes it while it commits.
    r.hooks.commit = () => r.edit(r.page, 'v3 include');
    await r.edit(r.page, 'v2 include');
    await vi.waitFor(() => expect(r.commits).toContain('3:v3 include|snippet v1'));
    await r.quiescent();
    expect(r.results.find((result) => result.generation === 2)).toMatchObject({
      status: 'success',
      superseded: true,
    });
    expect(r.reobserved).toEqual([]);
    expect(r.rescans).not.toHaveBeenCalled();
    expect(r.generations.slice(1)).toEqual([
      { generation: 2, origin: 'filesystem', changes: [`update:${r.page}`] },
      { generation: 3, origin: 'filesystem', changes: [`update:${r.page}`] },
    ]);
    // Skipping the reconcile does not skip the publication: both went through `published()`,
    // and the newest one's reload was sent.
    expect(r.published).toEqual([1, 2, 3]);
    expect(r.directSuccess).toEqual([]);
    expect(r.reloads.at(-1)).toBe(3);
  }, 20_000);
});

describe('watcher recovery is unchanged', () => {
  it('still re-observes every committed input after a watcher rescan', async () => {
    const r = await rig();
    await writeFile(r.page, 'v1 include');
    await writeFile(r.snippet, 'snippet v1');
    await r.start();

    // Nothing changed: the rescan still runs its reconciling generation.
    r.watcher.emit('error', fsError('EMFILE', 'stat', r.snippet));
    await vi.waitFor(() => expect(r.generations).toHaveLength(2));
    await r.quiescent();
    expect(r.generations[1]).toEqual({ generation: 2, origin: 'reconcile', changes: [] });

    // A lost edit is found wherever it is, not only at the path that failed.
    await writeFile(r.snippet, 'snippet v2');
    r.watcher.emit('error', fsError('EMFILE', 'stat', r.page));
    await vi.waitFor(() => expect(r.commits).toContain('3:v1 include|snippet v2'));
    await r.quiescent();
    expect(r.generations[2]).toEqual({
      generation: 3,
      origin: 'filesystem',
      changes: [`update:${r.snippet}`],
    });
    expect(r.diagnostics.map((item) => item.code)).toEqual([WATCHER_RESCAN, WATCHER_RESCAN]);
    expect(r.reobserved).toEqual([]);
    expect(r.rescans).not.toHaveBeenCalled();
  }, 20_000);

  it('keeps a lost watch on a path that becomes an input visible until restart', async () => {
    const r = await rig();
    await writeFile(r.page, 'v1');
    await writeFile(r.snippet, 'snippet v1');
    await r.start();

    // Not an input yet: only a warning, and remembered.
    r.watcher.emit('error', fsError('ENOSPC', 'watch', path.dirname(r.snippet)));
    await r.edit(r.page, 'v2 include');
    await vi.waitFor(() => expect(r.commits).toContain('2:v2 include|snippet v1'));
    await r.quiescent();
    expect(r.lifecycle.failure?.message).toContain('ENOSPC');
    expect(r.lifecycle.failure?.message).toContain('restart Vite');
    expect(r.diagnostics.filter((item) => item.severity === 'error')).toEqual([
      expect.objectContaining({ code: 'NGDOC_VITE_WATCHER' }),
    ]);
  }, 20_000);

  it('recovers an edit hidden by a recoverable failure on a path that becomes an input', async () => {
    const r = await rig();
    await writeFile(r.page, 'v1');
    await writeFile(r.snippet, 'snippet v1');
    await r.start();

    const held = r.hold();
    await r.edit(r.page, 'v2 include');
    await held.read;
    // The watcher fails on the snippet (not an input yet) and its edit event is lost.
    await writeFile(r.snippet, 'snippet v2');
    r.watcher.emit('error', fsError('EMFILE', 'stat', r.snippet));
    held.release();
    await vi.waitFor(() =>
      expect(r.commits.at(-1)).toBe(`${r.generations.length}:v2 include|snippet v2`),
    );
    await r.quiescent();
    expect(r.diagnostics.map((item) => item.code)).toContain(WATCHER_RESCAN);
    expect(r.lifecycle.failure).toBeUndefined();
    expect(r.rescans).not.toHaveBeenCalled();
  }, 20_000);
});

describe('a rejection overflow rescans every committed input', () => {
  /**
   * Rejects more distinct paths than the source retains while the held generation runs.
   * @param r The rig whose source rejects them.
   */
  const overflow = (r: Awaited<ReturnType<typeof rig>>) => {
    for (let index = 0; index <= MAX_RETAINED_REJECTIONS; index++) {
      expect(
        r.source.matches({ kind: 'update', path: path.join(r.root, `noise/${index}.md`) }),
      ).toBe(false);
    }
  };

  it('finds an edit the overflow hid and commits it in full, keeping the filesystem origin', async () => {
    const r = await rig();
    await writeFile(r.page, 'v1');
    await writeFile(r.snippet, 'snippet v1');
    await r.start();

    const held = r.hold();
    await r.edit(r.page, 'v2 include');
    await held.read;
    // Generation 2 has read snippet v1. Its edit is rejected (not an input yet), and so are more
    // paths than the source keeps: the observation cannot list which ones the new inputs match.
    await r.edit(r.snippet, 'snippet v2');
    overflow(r);
    held.release();
    await vi.waitFor(() => expect(r.commits).toContain('3:v2 include|snippet v2'));
    await r.quiescent();
    expect(r.rescans).toHaveBeenCalledOnce();
    expect(r.reobserved).toEqual([]);
    // The rescan re-observed every committed input: the lost edit is an ordinary change, so the
    // compiler may keep its retained program (its own sweep still decides), and the commit is
    // the full one, which re-verifies every output.
    expect(r.generations.slice(1)).toEqual([
      { generation: 2, origin: 'filesystem', changes: [`update:${r.page}`] },
      { generation: 3, origin: 'filesystem', changes: [`update:${r.snippet}`] },
    ]);
    expect(r.commitKinds.slice(2)).toEqual(['full']);
    expect(r.lifecycle.failure).toBeUndefined();
    expect(r.published).toEqual([1, 2, 3]);
  }, 20_000);

  it('still runs a reconcile generation when nothing changed, as the lossy-watcher rescan does', async () => {
    const r = await rig();
    await writeFile(r.page, 'v1');
    await writeFile(r.snippet, 'snippet v1');
    await r.start();

    const held = r.hold();
    await r.edit(r.page, 'v2 include');
    await held.read;
    overflow(r);
    held.release();
    await vi.waitFor(() => expect(r.generations).toHaveLength(3));
    await r.quiescent();
    expect(r.rescans).toHaveBeenCalledOnce();
    // No difference: a `reconcile` generation, which discards the compiler's retained program.
    expect(r.generations[2]).toEqual({ generation: 3, origin: 'reconcile', changes: [] });
    expect(r.commits.at(-1)).toBe('3:v2 include|snippet v1');
    expect(r.commitKinds.slice(2)).toEqual(['full']);
    expect(r.lifecycle.failure).toBeUndefined();
  }, 20_000);
});

describe('lifecycle reconciliation calls', () => {
  const success = (generation: number): Extract<BuildResult, { status: 'success' }> => ({
    status: 'success',
    generation,
    snapshot: {
      projectId: 'test',
      revision: `r${generation}`,
      artifacts: [],
      globalKeywords: [],
      remoteKeywords: [],
    },
    manifest: {
      schemaVersion: 1,
      projectId: 'test',
      generation,
      revision: `r${generation}`,
      files: [],
    },
    diagnostics: [],
    whyRebuilt: [],
  });

  it.each<[string, WatchObservation, 'rescan' | 'reconcileInputs']>([
    ['a rejection overflow (no path list)', { accepted: true, reconcile: true }, 'rescan'],
    ['a path list', { accepted: true, reconcile: true, paths: ['/x'] }, 'reconcileInputs'],
  ])('after %s asks the session for %s', async (_name, observation, expected) => {
    const root = await directory('ng-doc-reobserve-unit-');
    const source = {
      matches: vi.fn(() => false),
      started: vi.fn(),
      isCurrent: vi.fn(() => true),
      excludeOwned: vi.fn(),
      attached: vi.fn(async () => true),
      observe: vi.fn(async (): Promise<WatchObservation> => ({ ...observation })),
      dispose: vi.fn(async () => {}),
    } as unknown as ViteFileEventSource;
    const server = {
      config: { logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } },
      ws: { send: vi.fn() },
    } as unknown as ViteDevServer;
    const session = {
      rescan: vi.fn(async () => {}),
      reconcileInputs: vi.fn<(paths: readonly string[]) => Promise<void>>(async () => {}),
      dispose: vi.fn(async () => {}),
    };
    const lifecycle = new ViteAdapterLifecycle(
      acquireOutputLease(`reobserve-unit-${Date.now()}-${Math.random()}`, root),
    );
    lifecycle.attachServer(server, source);
    lifecycle.attachSession(session as unknown as BuildSession);
    const observer = lifecycle.observer(() => configuration(root));
    observer({ kind: 'started', generation: 2, changes: [] });
    observer({ kind: 'result', result: success(2) });
    await lifecycle.settled();
    expect(session[expected]).toHaveBeenCalledOnce();
    if (expected === 'rescan') {
      expect(session.rescan).toHaveBeenCalledWith();
      expect(session.reconcileInputs).not.toHaveBeenCalled();
    } else {
      expect(session.reconcileInputs).toHaveBeenCalledWith(['/x']);
      expect(session.rescan).not.toHaveBeenCalled();
    }
    expect(lifecycle.failure).toBeUndefined();
    await lifecycle.dispose();
  });

  it('lists new targets and replayed rejections once', async () => {
    const root = await directory('ng-doc-reobserve-source-');
    const source = new ViteFileEventSource(new FakeWatcher() as unknown as FSWatcher, 100);
    const page = normalize(path.join(root, 'page.md'));
    const late = normalize(path.join(root, 'late.md'));
    const glob = { root, include: ['*.md'], exclude: [] };
    const result = (generation: number, files: string[], globs = [glob]): BuildResult => ({
      ...success(generation),
      watchInputs: { files, globs },
    });
    // Seeding reports no path list: the session re-observes every input before it is ready.
    expect(await source.seed(1, { files: [page], globs: [] })).toEqual({
      accepted: true,
      reconcile: true,
    });
    source.started(2);
    expect(source.matches({ kind: 'update', path: late })).toBe(false);
    const snippet = normalize(path.join(root, 'snippet.md'));
    expect(await source.observe(result(2, [page, snippet]))).toEqual({
      accepted: true,
      reconcile: true,
      // The glob base directory, the new file, and the replayed rejection the glob now matches.
      paths: [normalize(root), late, snippet].sort(),
    });
    await source.dispose();
  });

  it('waits for chokidar to list new native targets, and gives up after the timeout', async () => {
    const root = await directory('ng-doc-reobserve-attach-');
    const watcher = new AttachingWatcher();
    const source = new ViteFileEventSource(watcher as unknown as FSWatcher, 100);
    const file = normalize(path.join(root, 'file.md'));
    const missing = normalize(path.join(root, 'missing/deep.md'));
    await writeFile(file, 'x');
    await source.seed(1, { files: [], globs: [] });
    source.started(2);
    await source.observe({ ...success(2), watchInputs: { files: [file, missing], globs: [] } });
    // Nothing listed yet: the wait ends at the timeout.
    expect(await source.attached([file], 50)).toBe(false);
    // A missing target counts once its nearest existing directory is listed.
    watcher.attach(file);
    watcher.attach(root);
    expect(await source.attached([file, missing], 1_000)).toBe(true);
    // Paths never handed to the watcher, and a watcher without `getWatched`, do not wait.
    expect(await source.attached([normalize(path.join(root, 'other.md'))], 50)).toBe(true);
    const plain = new ViteFileEventSource(new FakeWatcher() as unknown as FSWatcher, 100);
    expect(await plain.attached([file], 50)).toBe(true);
    await source.dispose();
    expect(await source.attached([file], 50)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// The real case: a Vite server with the C adapter and the built compiler and worker.
// ---------------------------------------------------------------------------------------------

interface Fixture {
  parent: string;
  root: string;
  docs: string;
  output: string;
  guide: string;
  other: string;
  fresh: string;
  app: string;
  log: string;
  config: string;
  tsconfig: string;
  cache: string;
}

async function workspace(): Promise<Fixture> {
  const parent = await directory('ng-doc-reobserve-app-');
  const root = path.join(parent, 'ws');
  const docs = path.join(root, 'docs');
  const fixture: Fixture = {
    parent,
    root,
    docs,
    output: path.join(root, 'generated'),
    cache: path.join(root, 'cache'),
    config: path.join(root, 'ng-doc.config.mjs'),
    tsconfig: path.join(root, 'tsconfig.json'),
    guide: path.join(docs, 'guide/guide.md'),
    other: path.join(docs, 'other/other.md'),
    fresh: path.join(docs, 'shared/fresh.md'),
    app: path.join(root, 'src/app.component.ts'),
    log: path.join(parent, 'compiles.jsonl'),
  };
  await mkdir(path.dirname(fixture.guide), { recursive: true });
  await mkdir(path.dirname(fixture.other), { recursive: true });
  await mkdir(path.dirname(fixture.fresh), { recursive: true });
  await mkdir(path.dirname(fixture.app), { recursive: true });
  await symlink(path.join(repository, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  await writeFile(
    fixture.config,
    "export default { docsPath: 'docs', tsConfig: 'tsconfig.json', routePrefix: '', cache: true };\n",
  );
  await writeFile(
    fixture.tsconfig,
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        experimentalDecorators: true,
        skipLibCheck: true,
        types: [],
      },
      include: ['docs/**/*.ts', 'src/**/*.ts'],
    }),
  );
  await writeFile(
    path.join(docs, 'guide/ng-doc.page.ts'),
    "const Guide = { title: 'Guide', route: 'guide', mdFile: './guide.md' };\nexport default Guide;\n",
  );
  await writeFile(fixture.guide, '# Guide\nGuide body marker.\n');
  await writeFile(
    path.join(docs, 'other/ng-doc.page.ts'),
    "const Other = { title: 'Other', route: 'other', mdFile: './other.md' };\nexport default Other;\n",
  );
  await writeFile(fixture.other, '# Other\nOther body first.\n');
  // Exists before the server starts, but no page includes it yet: not an input.
  await writeFile(fixture.fresh, 'Fresh include marker.\n');
  await writeFile(
    path.join(docs, 'ng-doc.api.ts'),
    "const api = { title: 'API', scopes: [{ name: 'fixture', route: 'fixture', include: 'src/api/**/*.ts' }] };\nexport default api;\n",
  );
  await mkdir(path.join(root, 'src/api'), { recursive: true });
  await writeFile(
    path.join(root, 'src/api/unique.ts'),
    '/** Returns unique items. */\nexport function unique<T>(items: T[]): T[] {\n  return [...new Set(items)];\n}\n',
  );
  await writeFile(
    fixture.app,
    "import { Component } from '@angular/core';\n@Component({ selector: 'fixture-app', template: 'app' })\nexport class AppComponent {}\n",
  );
  return fixture;
}

interface CompileRecord {
  generation: number;
  origin?: string;
  paths: string[];
  errors: string[];
  program?: string;
  discarded?: string;
}

/** The built compiler, wrapped to log each generation's origin, changes and program outcome. */
async function recordingCompiler(fixture: Fixture): Promise<string> {
  const wrapper = path.join(fixture.parent, 'recording-compiler.mjs');
  const base = path.join(repository, 'dist/libs/builder/generator/compiler/index.js');
  await writeFile(
    wrapper,
    `import { appendFileSync } from 'node:fs';
const real = await import(${JSON.stringify(pathToFileURL(base).href)});
export const incrementalRetention = real.incrementalRetention;
export async function createCompilationService(options) {
  const service = await real.createCompilationService(options);
  return {
    ...service,
    async compile(request, signal, context) {
      const result = await service.compile(request, signal, context);
      const last = real.incrementalRetention?.().last;
      appendFileSync(${JSON.stringify(fixture.log)}, JSON.stringify({
        generation: request.generation,
        origin: request.contentRequest?.origin,
        paths: request.changes.map((item) => item.kind + ':' + item.path),
        errors: result.diagnostics.filter((item) => item.severity === 'error').map((item) => item.message),
        program: last?.synchronization?.path,
        discarded: last?.discarded,
      }) + '\\n');
      return result;
    },
    acknowledge: service.acknowledge?.bind(service),
    dispose: () => service.dispose(),
  };
}
`,
  );
  return wrapper;
}

function compiles(fixture: Fixture): CompileRecord[] {
  if (!existsSync(fixture.log)) return [];
  return readFileSync(fixture.log, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as CompileRecord);
}

function fakeAngularPlugins(probe: string): Plugin[] {
  return [
    {
      name: '@analogjs/vite-plugin-angular',
      buildStart() {},
      handleHotUpdate() {},
      transform: {
        filter: { id: /\.ts$/ },
        handler(_code: string, id: string) {
          if (path.resolve(id.replace(/\?.*$/, '')) !== path.resolve(probe)) return;
          return { code: 'export class AppComponent {}; AppComponent.ɵcmp = {};', map: null };
        },
      },
    },
    { name: 'fake-angular-companion' },
  ];
}

async function start(fixture: Fixture): Promise<ViteDevServer> {
  const server = await createServer({
    root: fixture.root,
    // Its own dependency cache (below a node_modules folder, as linters and editors skip): the
    // default one is shared by every fixture.
    cacheDir: path.join(fixture.root, '.vite/node_modules/.vite'),
    configFile: false,
    base: '/preview/',
    plugins: [
      createNgDocVitePlugin({
        analogLiveReload: true,
        angularPlugins: qualifyAngularPlugins(fakeAngularPlugins(fixture.app)),
        angularComponentProbe: fixture.app,
        generator: {
          projectId: 'reobserve-fixture',
          workspaceRoot: fixture.root,
          configFile: fixture.config,
          defaults: {
            docsRoot: fixture.docs,
            tsConfig: fixture.tsconfig,
            outputRoot: fixture.output,
            cacheRoot: fixture.cache,
          },
          templateRoot: path.join(repository, 'dist/libs/builder/generator/templates'),
          worker: {
            moduleUrl: pathToFileURL(await recordingCompiler(fixture)),
            workerEntryUrl: pathToFileURL(
              path.join(repository, 'dist/libs/builder/generator/worker/entry.js'),
            ),
          },
          session: { batchDelayMs: 5 },
        },
      }),
    ],
    server: { host: '127.0.0.1', port: 0 },
    logLevel: 'silent',
  });
  servers.push(server);
  return server;
}

async function waitFor(
  check: () => Promise<boolean> | boolean,
  timeout: number = 30_000,
): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('Timed out');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function outputs(root: string, suffix: string): Promise<string[]> {
  const found: string[] = [];
  if (!existsSync(root)) return found;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) found.push(...(await outputs(file, suffix)));
    else if (entry.name.endsWith(suffix)) found.push(file);
  }
  return found.sort();
}

/** The committer renames published files into place: a concurrent read can see ENOENT. */
async function settledRead<T>(read: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await read();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || attempt > 100) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
}

/** The browser's view: every generated content module is loaded into the client module graph. */
async function load(server: ViteDevServer, fixture: Fixture): Promise<void> {
  await settledRead(async () => {
    for (const file of await outputs(fixture.output, '.mjs')) {
      await server.environments.client.transformRequest(`/@fs${normalize(file)}`);
    }
  });
}

async function contains(fixture: Fixture, marker: string): Promise<boolean> {
  return settledRead(async () => {
    for (const file of await outputs(fixture.output, '.mjs')) {
      if ((await readFile(file, 'utf8')).includes(marker)) return true;
    }
    return false;
  });
}

/** A browser's HMR client; each full reload records how many generations had been compiled. */
async function hmrClient(server: ViteDevServer, fixture: Fixture) {
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('Missing Vite address');
  const socket = new WebSocket(
    `ws://127.0.0.1:${address.port}/preview/?token=${server.config.webSocketToken}`,
    'vite-hmr',
  );
  const reloads: Array<{ compiled: number; triggeredBy?: string }> = [];
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data)) as { type: string; triggeredBy?: string };
    if (message.type === 'full-reload') {
      reloads.push({
        compiled: compiles(fixture).length,
        ...(message.triggeredBy ? { triggeredBy: message.triggeredBy } : {}),
      });
    }
  });
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true });
    socket.addEventListener('error', () => reject(new Error('HMR socket failed')), { once: true });
  });
  cleanups.push(() => socket.close());
  return reloads;
}

async function quiescent(
  fixture: Fixture,
  reloads: readonly unknown[],
  quiet: number = 1_500,
): Promise<void> {
  let key = '';
  let since = Date.now();
  for (const deadline = Date.now() + 60_000; ; ) {
    const current = `${compiles(fixture).length}/${reloads.length}`;
    if (current !== key) {
      key = current;
      since = Date.now();
    } else if (Date.now() - since >= quiet) return;
    if (Date.now() > deadline) throw new Error('Did not settle');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe('new inputs on a Vite server with the built compiler', () => {
  it('publishes a new include with filesystem generations that keep the program, one reload per publication', async () => {
    const fixture = await workspace();
    const server = await start(fixture);
    await server.listen();
    const reloads = await hmrClient(server, fixture);
    await load(server, fixture);
    // The watch runtime's warm-up (priming) must have built the program the edit can retain: on a
    // loaded machine it can outlast the quiet window, and an edit would then abort it and run a
    // full first generation, whatever the reconcile does.
    await waitFor(
      () =>
        compiles(fixture).some(
          (record) => record.program === 'full' || record.program === 'reused',
        ),
      90_000,
    );
    await quiescent(fixture, reloads);
    const before = compiles(fixture).length;
    const reloadsBefore = reloads.length;
    expect(compiles(fixture).every((record) => record.errors.length === 0)).toBe(true);

    const text = await readFile(fixture.guide, 'utf8');
    await writeFile(fixture.guide, `${text}\n{% include "../shared/fresh.md" %}\n`);
    await waitFor(() => contains(fixture, 'Fresh include marker'));
    await quiescent(fixture, reloads);
    await load(server, fixture);
    await quiescent(fixture, reloads);

    // Final state, not an exact generation list: under load a duplicate watcher event can abort
    // the edit's generation and run it again. What must hold: every generation after the edit is
    // an ordinary filesystem one (never a reconcile generation, never the reconcile discard), and
    // the last one succeeded with the retained program. Only an aborted generation in between
    // may have released the program (retention behaviour independent of the reconcile).
    const after = compiles(fixture).slice(before);
    expect(after.length).toBeGreaterThanOrEqual(1);
    expect(
      after.filter(
        (record) => record.origin !== 'filesystem' || /reconcile/.test(record.discarded ?? ''),
      ),
    ).toEqual([]);
    expect(after.at(-1)).toMatchObject({
      origin: 'filesystem',
      paths: [`update:${normalize(fixture.guide)}`],
      errors: [],
    });
    const aborted = after.some((record) => record.errors.some((error) => /abort/i.test(error)));
    if (!aborted) {
      expect(after.map((record) => record.program)).toEqual(after.map(() => 'reused'));
    }
    // The adapter reloads (at most once per published generation), Vite never adds its own.
    const edited = reloads.slice(reloadsBefore);
    expect(edited.filter((reload) => reload.triggeredBy !== undefined)).toEqual([]);
    expect(edited.length).toBeGreaterThanOrEqual(1);
    expect(edited.length).toBeLessThanOrEqual(after.length);
    await server.close();
  }, 120_000);

  it('leaves an unseen change of a new include to the generation that superseded its recorder, which re-verifies it', async () => {
    const fixture = await workspace();
    const server = await start(fixture);
    await server.listen();
    const reloads = await hmrClient(server, fixture);
    await load(server, fixture);
    await waitFor(
      () =>
        compiles(fixture).some(
          (record) => record.program === 'full' || record.program === 'reused',
        ),
      90_000,
    );
    await quiescent(fixture, reloads);
    const before = compiles(fixture).length;

    // Generation N records the new include. While it commits (after it read the include), the
    // include changes with no event the session accepts (not an input yet), and an edit of
    // another page supersedes N. Its successor re-renders only that page, so the guide is reused:
    // the include's change must be found by re-verifying the reused inputs, not by an event.
    let raced = false;
    stage.removing = async () => {
      raced = true;
      await writeFile(fixture.fresh, 'Fresh include second.\n');
      const changed = new Promise<void>((resolve) => {
        const listener = (file: string) => {
          if (normalize(file) !== normalize(fixture.other)) return;
          server.watcher.off('change', listener);
          resolve();
        };
        server.watcher.on('change', listener);
      });
      await writeFile(fixture.other, '# Other\nOther body second.\n');
      await changed;
      await new Promise((resolve) => setTimeout(resolve, 200));
    };
    const text = await readFile(fixture.guide, 'utf8');
    await writeFile(fixture.guide, `${text}\n{% include "../shared/fresh.md" %}\n`);
    await waitFor(
      async () =>
        (await contains(fixture, 'Other body second')) &&
        (await contains(fixture, 'Fresh include second')),
    );
    await quiescent(fixture, reloads);
    expect(raced).toBe(true);
    const after = compiles(fixture).slice(before);
    expect(after.length).toBeGreaterThanOrEqual(2);
    // Never a reconcile generation, and never an event for the include.
    expect(after.filter((record) => record.origin !== 'filesystem')).toEqual([]);
    expect(
      after.filter((record) => record.paths.some((entry) => entry.endsWith('/fresh.md'))),
    ).toEqual([]);
    expect(await contains(fixture, 'Fresh include marker')).toBe(false);
    await server.close();
  }, 120_000);
});
