/** @vitest-environment node */

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  BuildEvent,
  CompilationRequest,
  CompilationResult,
  Dependency,
  FileChange,
} from '../../contracts';
import { type SessionOptions, createBuildSession, GeneratorBuildSession } from '../build-session';
import { UNCHANGED_SAVE_LIMITS, UnchangedSaves } from '../unchanged-saves';
import { filterFileEvents, WatchInputFilter } from '../watch-input-filter';
import { compilation, deferred, Events, harness, until } from './support';

const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));
const aborted = (): CompilationResult => ({
  dependencies: [],
  diagnostics: [
    {
      code: 'WORKER_ABORTED',
      severity: 'error',
      stage: 'evaluation',
      message: 'Compilation aborted',
    },
  ],
  whyRebuilt: [],
});

interface Attempt {
  request: CompilationRequest;
  signal: AbortSignal;
  /** Observes the tracked files now, as a compiler reading them at this point would. */
  read(): void;
  /** Settles with the observation made by read() (or a fresh one). */
  release(): void;
}

/**
 * A compiler that records a real content observation of every tracked file, and a candidate
 * whose revision is the observed bytes, so the committed state shows what a generation read.
 * `broken` content fails the generation, like a compile error.
 */
function readingCompiler(
  h: ReturnType<typeof harness>,
  tracked: () => string[],
  blocking: boolean = false,
) {
  const attempts: Attempt[] = [];
  const observe = (request: CompilationRequest): CompilationResult => {
    const files = tracked();
    const dependencies: Dependency[] = files.map((file) =>
      existsSync(file)
        ? { kind: 'content', path: file, digest: digest(readFileSync(file)) }
        : { kind: 'existence', path: file, exists: false },
    );
    const texts = files.map((file) => (existsSync(file) ? readFileSync(file, 'utf8') : '-'));
    if (texts.includes('broken')) {
      return {
        dependencies,
        diagnostics: [{ code: 'COMPILE', severity: 'error', stage: 'content', message: 'broken' }],
        whyRebuilt: [],
      };
    }
    return { ...compilation(`${request.generation}:${texts.join('|')}`), dependencies };
  };
  h.compile.mockImplementation((request, signal) => {
    if (!blocking) return Promise.resolve(observe(request));
    const done = deferred<CompilationResult>();
    let observed: CompilationResult | undefined;
    signal.addEventListener('abort', () => done.resolve(aborted()), { once: true });
    attempts.push({
      request,
      signal,
      read: () => {
        observed = observe(request);
      },
      release: () => done.resolve(observed ?? observe(request)),
    });
    return done.promise;
  });
  return attempts;
}

describe('unchanged saves (no-op filter)', () => {
  const sessions: GeneratorBuildSession[] = [];
  const roots: string[] = [];
  function session(h: ReturnType<typeof harness> = harness(), options: SessionOptions = {}) {
    const result = createBuildSession(h.services, { batchDelayMs: 0, ...options });
    sessions.push(result);
    return result;
  }
  function temporary() {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'ngdoc-unchanged-')));
    roots.push(root);
    return root;
  }
  afterEach(async () => {
    await Promise.allSettled(sessions.splice(0).map((item) => item.dispose()));
    roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
  });

  /** A watched session over one tracked page with v1 committed. */
  async function watched(options: { blocking?: boolean; session?: object; extra?: string[] } = {}) {
    const root = temporary();
    const page = join(root, 'page.md');
    writeFileSync(page, 'v1');
    const h = harness();
    const attempts = readingCompiler(h, () => [page, ...(options.extra ?? [])], options.blocking);
    const s = session(h, options.session);
    const source = new Events();
    const events: BuildEvent[] = [];
    const returned: unknown[] = [];
    const watch = await s.watch(source, (event) => events.push(event));
    const listener = source.listener!;
    source.listener = (changes) => {
      const value = listener(changes);
      returned.push(value);
      return value;
    };
    if (options.blocking) {
      await until(() => attempts.length === 1);
      attempts[0].release();
    }
    expect(await watch.initial).toMatchObject({
      status: 'success',
      snapshot: { revision: '1:v1' },
    });
    const commits = () => h.commit.mock.calls.map((call) => call[0].candidate.revision);
    const unchanged = () =>
      events.flatMap((event) =>
        event.kind === 'unchanged' ? event.changes.map((change) => change.path) : [],
      );
    return { root, page, h, s, source, events, returned, attempts, commits, unchanged, watch };
  }

  it('discards an identical save, reports it as unchanged and returns false to the source', async () => {
    const { page, h, source, returned, commits, unchanged } = await watched();
    writeFileSync(page, 'v1');
    source.emit({ kind: 'update', path: page });
    expect(returned).toEqual([false]);
    expect(unchanged()).toEqual([page]);
    await pause(30);
    expect(h.compile).toHaveBeenCalledTimes(1);
    // A real edit still regenerates; saving it again is discarded again.
    writeFileSync(page, 'v2');
    source.emit({ kind: 'update', path: page });
    await until(() => commits().length === 2);
    expect(commits()[1]).toBe('2:v2');
    source.emit({ kind: 'update', path: page });
    await pause(30);
    expect(h.compile).toHaveBeenCalledTimes(2);
    expect(unchanged()).toEqual([page, page]);
  });

  it('still runs a revert during an active generation that lists the path', async () => {
    const { page, source, attempts, commits, unchanged } = await watched({ blocking: true });
    writeFileSync(page, 'v2');
    source.emit({ kind: 'update', path: page });
    await until(() => attempts.length === 2);
    attempts[1].read();
    // Reverted to the committed bytes while generation 2 (which read v2) is running.
    writeFileSync(page, 'v1');
    source.emit({ kind: 'update', path: page });
    await until(() => attempts.length === 3);
    expect(attempts[1].signal.aborted).toBe(true);
    expect(attempts[2].request.changes).toEqual([{ kind: 'update', path: page }]);
    attempts[2].release();
    await until(() => commits().length === 2);
    expect(commits()).toEqual(['1:v1', '3:v1']);
    expect(unchanged()).toEqual([]);
  });

  it('keeps a revert whose change is still queued behind a protected generation', async () => {
    const { page, source, attempts, commits, unchanged, s } = await watched({
      blocking: true,
      session: { maxSupersessions: 0 },
    });
    writeFileSync(page, 'v2');
    source.emit({ kind: 'update', path: page });
    await until(() => attempts.length === 2);
    attempts[1].read();
    writeFileSync(page, 'v3');
    source.emit({ kind: 'update', path: page });
    await until(() => s.inspect().queuedBuilds === 1);
    writeFileSync(page, 'v1');
    source.emit({ kind: 'update', path: page });
    expect(unchanged()).toEqual([]);
    attempts[1].release();
    await until(() => attempts.length === 3);
    attempts[2].release();
    await until(() => commits().length === 3);
    expect(commits()).toEqual(['1:v1', '2:v2', '3:v1']);
  });

  it('handles A→B→A: within one batch it commits A; coalesced into one event while idle it is discarded', async () => {
    const { page, h, source, commits, unchanged } = await watched({
      session: { batchDelayMs: 40 },
    });
    writeFileSync(page, 'v2');
    source.emit({ kind: 'update', path: page });
    writeFileSync(page, 'v1');
    source.emit({ kind: 'update', path: page });
    await until(() => commits().length === 2);
    expect(h.compile.mock.calls[1][0].changes).toEqual([{ kind: 'update', path: page }]);
    expect(commits()[1]).toBe('2:v1');
    // A watcher that coalesced B→A reports one event after both writes.
    writeFileSync(page, 'v3');
    writeFileSync(page, 'v1');
    source.emit({ kind: 'update', path: page });
    await pause(80);
    expect(h.compile).toHaveBeenCalledTimes(2);
    expect(unchanged()).toEqual([page]);
  });

  it('defers a matching save while another generation runs and decides it against what that generation committed', async () => {
    // Generation 2 does not list page.md but reads it during a transient v2 (a coalesced
    // v1→v2→v1 write). Discarding the save against the old commit would publish stale v2.
    const { root, page, source, attempts, commits, unchanged, returned } = await watched({
      blocking: true,
      extra: [],
    });
    const other = join(root, 'other.md');
    source.emit({ kind: 'update', path: other });
    await until(() => attempts.length === 2);
    writeFileSync(page, 'v2');
    attempts[1].read();
    writeFileSync(page, 'v1');
    source.emit({ kind: 'update', path: page });
    // Deferred: neither admitted (no supersession) nor reported as discarded yet.
    expect(returned.at(-1)).toBeUndefined();
    expect(attempts[1].signal.aborted).toBe(false);
    expect(unchanged()).toEqual([]);
    attempts[1].release();
    await until(() => attempts.length === 3);
    expect(attempts[2].request.changes).toEqual([{ kind: 'update', path: page }]);
    attempts[2].release();
    await until(() => commits().length === 3);
    expect(commits()).toEqual(['1:v1', '2:v2', '3:v1']);
    // The same race where the generation read v1 is discarded once it commits.
    source.emit({ kind: 'update', path: other });
    await until(() => attempts.length === 4);
    attempts[3].read();
    source.emit({ kind: 'update', path: page });
    attempts[3].release();
    await until(() => commits().length === 4);
    await until(() => unchanged().length === 1);
    expect(unchanged()).toEqual([page]);
    await pause(30);
    expect(attempts).toHaveLength(4);
  });

  it('discards a deferred save after the running generation is cancelled when the base is unchanged', async () => {
    const { root, page, source, attempts, commits, unchanged } = await watched({ blocking: true });
    const other = join(root, 'other.md');
    source.emit({ kind: 'update', path: other });
    await until(() => attempts.length === 2);
    source.emit({ kind: 'update', path: page });
    source.emit({ kind: 'create', path: join(root, 'new.md') });
    await until(() => attempts.length === 3);
    expect(attempts[1].signal.aborted).toBe(true);
    await until(() => unchanged().length === 1);
    expect(attempts[2].request.changes.map((change: FileChange) => change.path)).not.toContain(
      page,
    );
    attempts[2].release();
    await until(() => commits().length === 2);
  });

  it('never discards creates, deletes or paths without a recorded content digest', async () => {
    const { root, page, h, source, commits, unchanged } = await watched({ extra: [] });
    source.emit({ kind: 'create', path: page });
    await until(() => commits().length === 2);
    source.emit({ kind: 'delete', path: page });
    await until(() => commits().length === 3);
    const unrecorded = join(root, 'unrecorded.md');
    writeFileSync(unrecorded, 'x');
    source.emit({ kind: 'update', path: unrecorded });
    await until(() => commits().length === 4);
    expect(h.compile).toHaveBeenCalledTimes(4);
    expect(unchanged()).toEqual([]);
  });

  it('never discards a path recorded only as an existence observation', async () => {
    const root = temporary();
    const missing = join(root, 'missing.md');
    const h = harness();
    readingCompiler(h, () => [missing]);
    const s = session(h);
    const source = new Events();
    const events: BuildEvent[] = [];
    await (
      await s.watch(source, (event) => events.push(event))
    ).initial;
    source.emit({ kind: 'update', path: missing });
    await until(() => h.commit.mock.calls.length === 2);
    expect(events.some((event) => event.kind === 'unchanged')).toBe(false);
  });

  it('regenerates a revert to the committed bytes after a failed generation', async () => {
    const { page, source, commits, unchanged, events } = await watched();
    writeFileSync(page, 'broken');
    source.emit({ kind: 'update', path: page });
    await until(() =>
      events.some((event) => event.kind === 'result' && event.result.status === 'failure'),
    );
    writeFileSync(page, 'v1');
    source.emit({ kind: 'update', path: page });
    await until(() => commits().length === 2);
    expect(commits()[1]).toBe('3:v1');
    expect(unchanged()).toEqual([]);
    // Healthy again: the next identical save is discarded.
    source.emit({ kind: 'update', path: page });
    expect(unchanged()).toEqual([page]);
  });

  it('keeps a verified startup baseline when only an unchanged save arrives during subscription', async () => {
    const root = temporary();
    const page = join(root, 'page.md');
    writeFileSync(page, 'v1');
    const h = harness();
    readingCompiler(h, () => [page]);
    const s = session(h);
    const built = await s.buildOnce({ mode: 'development' });
    const source = new Events();
    const gate = deferred<void>();
    source.gate = gate.promise;
    const events: BuildEvent[] = [];
    const watch = await s.watch(source, (event) => events.push(event));
    await until(() => source.subscribed === 1);
    source.emit({ kind: 'update', path: page });
    gate.resolve();
    expect(await watch.initial).toEqual(built);
    expect(h.compile).toHaveBeenCalledTimes(1);
    expect(events).toEqual([{ kind: 'unchanged', changes: [{ kind: 'update', path: page }] }]);
  });

  it('admits identical saves after the host reports a failed publication, until the next success', async () => {
    const { page, source, commits, unchanged, s } = await watched();
    s.publicationFailed();
    source.emit({ kind: 'update', path: page });
    await until(() => commits().length === 2);
    expect(unchanged()).toEqual([]);
    source.emit({ kind: 'update', path: page });
    expect(unchanged()).toEqual([page]);
  });

  it('screens a burst of real edits delivered one event per call in linear time', async () => {
    // Vite forwards every change on its own; the busy set must not be rebuilt per changed file.
    const root = temporary();
    const files = Array.from({ length: 4000 }, (_, index) => join(root, `page-${index}.md`));
    files.forEach((file, index) =>
      writeFileSync(file, `# page ${index}\n${'lorem ipsum '.repeat(300)}`),
    );
    const h = harness();
    readingCompiler(h, () => files);
    const s = session(h, { batchDelayMs: 20 });
    const source = new Events();
    const watch = await s.watch(source, () => {});
    await watch.initial;
    files.forEach((file, index) =>
      writeFileSync(file, `# page ${index} changed\n${'lorem ipsum '.repeat(300)}`),
    );
    const started = performance.now();
    for (const path of files) source.emit({ kind: 'update', path });
    const elapsed = performance.now() - started;
    // A quadratic screen took about 7.7 s for this burst; the linear one takes ~0.1–0.3 s.
    expect(elapsed).toBeLessThan(3000);
    expect(s.inspect().pendingChanges).toBe(files.length);
    await watch.dispose();
  }, 60_000);

  it('admits every save when skipUnchangedSaves is false', async () => {
    const { page, h, source, commits, unchanged, returned } = await watched({
      session: { skipUnchangedSaves: false },
    });
    source.emit({ kind: 'update', path: page });
    await until(() => commits().length === 2);
    expect(h.compile).toHaveBeenCalledTimes(2);
    expect(unchanged()).toEqual([]);
    expect(returned).toEqual([undefined]);
  });

  it('drops deferred saves when the watch stops', async () => {
    const { root, page, source, attempts, unchanged, watch, h } = await watched({ blocking: true });
    source.emit({ kind: 'update', path: join(root, 'other.md') });
    await until(() => attempts.length === 2);
    source.emit({ kind: 'update', path: page });
    const disposed = watch.dispose();
    await until(() => attempts[1].signal.aborted);
    await disposed;
    expect(unchanged()).toEqual([]);
    expect(h.compile).toHaveBeenCalledTimes(2);
  });

  describe('composition with the watch-input filter', () => {
    function wired(options: { capacity?: number; backoff?: number } = {}) {
      const root = temporary();
      const page = join(root, 'page.md');
      const snippet = join(root, 'snippet.md');
      writeFileSync(page, 'v1');
      writeFileSync(snippet, 's1');
      const tracked = [page];
      const h = harness();
      const attempts = readingCompiler(h, () => [...tracked], true);
      const s = session(h);
      const filter = new WatchInputFilter({
        capacity: options.capacity ?? 1024,
        reconcileBackoff: { initialMs: options.backoff ?? 200, maxMs: 1000 },
      });
      const native = new Events();
      const events: BuildEvent[] = [];
      // Wired as in angular/runner.ts.
      const observer = (event: BuildEvent) => {
        events.push(event);
        if (event.kind === 'started') filter.started();
        if (event.kind === 'result') filter.observe(event.result);
      };
      return { root, page, snippet, tracked, h, attempts, s, filter, native, events, observer };
    }

    it('replays a retained change and discards it only when the generation already read those bytes', async () => {
      const w = wired();
      const watch = await w.s.watch(filterFileEvents(w.native, w.filter), w.observer);
      await until(() => w.attempts.length === 1);
      w.attempts[0].release();
      await watch.initial;
      // Generation 2 records snippet.md for the first time and reads it after the edit.
      w.tracked.push(w.snippet);
      writeFileSync(w.page, 'v2');
      w.native.emit({ kind: 'update', path: w.page });
      await until(() => w.attempts.length === 2);
      writeFileSync(w.snippet, 's2');
      w.native.emit({ kind: 'update', path: w.snippet });
      expect(w.filter.retainedCount()).toBe(1);
      w.attempts[1].release();
      await until(() =>
        w.events.some((event) => event.kind === 'unchanged' && event.changes[0].path === w.snippet),
      );
      await pause(30);
      expect(w.attempts).toHaveLength(2);
      // Generation 3 records another file and reads it before it is edited: the replay regenerates.
      const second = join(w.root, 'second.md');
      writeFileSync(second, 't1');
      w.tracked.push(second);
      writeFileSync(w.page, 'v3');
      w.native.emit({ kind: 'update', path: w.page });
      await until(() => w.attempts.length === 3);
      w.attempts[2].read();
      writeFileSync(second, 't2');
      w.native.emit({ kind: 'update', path: second });
      expect(w.filter.retainedCount()).toBe(1);
      w.attempts[2].release();
      await until(() => w.attempts.length === 4);
      expect(w.attempts[3].request.changes).toEqual([{ kind: 'update', path: second }]);
      w.attempts[3].release();
      await until(() => w.h.commit.mock.calls.length === 4);
      expect(w.h.commit.mock.calls[3][0].candidate.revision).toBe('4:v3|s2|t2');
    });

    it('does not end a scheduled reconcile streak with a discarded save', async () => {
      const w = wired({ capacity: 1, backoff: 150 });
      const watch = await w.s.watch(filterFileEvents(w.native, w.filter), w.observer);
      await until(() => w.attempts.length === 1);
      w.attempts[0].release();
      await watch.initial;
      // Two overflowing generations: the first reconcile runs at once, the second is backed off.
      const overflow = async (index: number) => {
        await until(() => w.attempts.length === index + 1);
        w.native.emit({ kind: 'create', path: join(w.root, `.cache/a${index}`) });
        w.native.emit({ kind: 'create', path: join(w.root, `.cache/b${index}`) });
        w.attempts[index].release();
      };
      writeFileSync(w.page, 'v2');
      w.native.emit({ kind: 'update', path: w.page });
      await overflow(1);
      await overflow(2);
      await until(() => w.filter.reconcileScheduled());
      await until(() => w.h.commit.mock.calls.length === 3);
      // A no-op save of a recorded input: discarded, so the scheduled reconcile must survive.
      w.native.emit({ kind: 'update', path: w.page });
      expect(w.events.filter((event) => event.kind === 'unchanged')).toHaveLength(1);
      expect(w.filter.reconcileScheduled()).toBe(true);
      await until(() => w.attempts.length === 4, 2000);
      expect(w.attempts[3].request.contentRequest).toEqual({ origin: 'reconcile' });
      w.attempts[3].release();
      await until(() => w.h.commit.mock.calls.length === 4);
      // An admitted real edit still ends the streak as before.
      writeFileSync(w.page, 'v3');
      w.native.emit({ kind: 'update', path: w.page });
      await until(() => w.attempts.length === 5);
      w.attempts[4].release();
      await until(() => w.h.commit.mock.calls.length === 5);
    });

    it('calls admitted() only when the listener does not report every change discarded', async () => {
      const filter = new WatchInputFilter();
      const settle = vi.spyOn(filter, 'admitted');
      const native = new Events();
      const values: Array<boolean | undefined> = [false, true, undefined];
      await filterFileEvents(native, filter).subscribe(
        () => values.shift(),
        () => {},
      );
      native.emit({ kind: 'update', path: '/a' });
      expect(settle).not.toHaveBeenCalled();
      native.emit({ kind: 'update', path: '/a' });
      native.emit({ kind: 'update', path: '/a' });
      expect(settle).toHaveBeenCalledTimes(2);
    });

    it('leaves a lossy-watcher reconcile untouched by the filter', async () => {
      const { page, h, source, commits } = await watched();
      source.emit({ kind: 'update', path: page });
      source.onError!({
        code: 'WATCHER_RESCAN',
        severity: 'warning',
        stage: 'host',
        message: 'dropped',
      });
      await until(() => commits().length === 2);
      expect(h.compile.mock.calls[1][0].contentRequest).toEqual({ origin: 'reconcile' });
    });
  });
});

describe('UnchangedSaves', () => {
  const change = (path: string, kind: FileChange['kind'] = 'update'): FileChange => ({
    kind,
    path,
  });
  const idle = { active: false, busy: () => false };

  it('decides nothing before a successful generation and after a failed one', () => {
    const filter = new UnchangedSaves(UNCHANGED_SAVE_LIMITS, () => ({ digest: 'd', bytes: 1 }));
    filter.committed([{ kind: 'content', path: '/a', digest: 'd' }]);
    expect(filter.screen([change('/a')], idle).passed).toHaveLength(1);
    filter.settled('success');
    expect(filter.screen([change('/a')], idle).dropped).toHaveLength(1);
    filter.settled('failure');
    expect(filter.screen([change('/a')], idle).passed).toHaveLength(1);
    expect(filter.recorded('/a')).toBe('d');
    filter.reset();
    expect(filter.recorded('/a')).toBeUndefined();
  });

  it('admits unreadable, oversized and over-budget candidates and reads a repeated path once', () => {
    const reads: string[] = [];
    const sizes: Record<string, number> = { '/a': 1, '/b': 1, '/c': 1, '/big': 10 };
    const filter = new UnchangedSaves(
      { maxFileBytes: 5, maxFilesPerBatch: 2, maxBytesPerBatch: 100 },
      (file, max) => {
        reads.push(file);
        if (file === '/gone') return undefined;
        return sizes[file] > max ? undefined : { digest: 'd', bytes: sizes[file] };
      },
    );
    filter.committed(
      ['/a', '/b', '/c', '/big', '/gone'].map((path) => ({
        kind: 'content' as const,
        path,
        digest: 'd',
      })),
    );
    filter.settled('success');
    const first = filter.screen([change('/a'), change('/a'), change('/big'), change('/b')], idle);
    expect(first.dropped.map((item) => item.path)).toEqual(['/a', '/a']);
    // /big is over the file limit; /b exceeds the two-file budget of this batch.
    expect(first.passed.map((item) => item.path)).toEqual(['/big', '/b']);
    expect(reads).toEqual(['/a', '/big']);
    expect(filter.screen([change('/gone')], idle).passed).toHaveLength(1);
    const bytes = new UnchangedSaves(
      { maxFileBytes: 5, maxFilesPerBatch: 10, maxBytesPerBatch: 1 },
      () => ({ digest: 'd', bytes: 1 }),
    );
    bytes.committed([
      { kind: 'content', path: '/a', digest: 'd' },
      { kind: 'content', path: '/b', digest: 'd' },
    ]);
    bytes.settled('success');
    expect(
      bytes.screen([change('/a'), change('/b')], idle).passed.map((item) => item.path),
    ).toEqual(['/b']);
  });

  it('defers while active, forgets a deferred path when a later event passes, and hashes real files', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'ngdoc-unchanged-unit-')));
    try {
      const file = join(root, 'a.md');
      writeFileSync(file, 'same');
      const filter = new UnchangedSaves();
      filter.committed([{ kind: 'content', path: file, digest: digest('same') }]);
      filter.settled('success');
      expect(filter.screen([change(file)], { active: true, busy: () => false }).deferred).toBe(1);
      expect(filter.deferredCount()).toBe(1);
      writeFileSync(file, 'other');
      expect(
        filter.screen([change(file)], { active: true, busy: () => false }).passed,
      ).toHaveLength(1);
      expect(filter.deferredCount()).toBe(0);
      writeFileSync(file, 'same');
      filter.screen([change(file)], { active: true, busy: () => false });
      expect(filter.takeDeferred()).toEqual([change(file)]);
      filter.screen([change(file)], { active: true, busy: () => false });
      filter.clearDeferred();
      expect(filter.takeDeferred()).toEqual([]);
      expect(
        filter.screen([change(file)], { active: false, busy: () => true }).passed,
      ).toHaveLength(1);
      expect(filter.screen([change(root)], idle).passed).toHaveLength(1);
      const large = new UnchangedSaves({ ...UNCHANGED_SAVE_LIMITS, maxFileBytes: 2 });
      large.committed([{ kind: 'content', path: file, digest: digest('same') }]);
      large.settled('success');
      expect(large.screen([change(file)], idle).passed).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
