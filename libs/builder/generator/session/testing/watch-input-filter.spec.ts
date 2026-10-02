/** @vitest-environment node */

import { createHash } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BuildResult, Dependency, FileChange, WatchInputs } from '../../contracts';
import { createBuildSession } from '../build-session';
import { changedInputs } from '../input-verification';
import { filterFileEvents, WatchInputFilter } from '../watch-input-filter';
import { isRescanSignal, WATCHER_RESCAN } from '../watch-signals';
import { compilation, Events, harness, hostJoin, temporaryDirectory, until } from './support';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const rescanSignal = {
  code: WATCHER_RESCAN,
  severity: 'warning' as const,
  stage: 'host' as const,
  message: 'Events were dropped by the FSEvents client. File system must be re-scanned.',
};

it('identifies the lossy-watcher protocol signal', () => {
  expect(isRescanSignal(rescanSignal)).toBe(true);
  expect(isRescanSignal({ ...rescanSignal, code: 'WATCHER_ERROR' })).toBe(false);
});

describe('changedInputs', () => {
  const roots: string[] = [];
  afterEach(() =>
    roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })),
  );

  it('reports differences as watcher events, prefers structural changes and skips owned roots', async () => {
    const root = temporaryDirectory('ngdoc-changed-', true);
    roots.push(root);
    const a = hostJoin(root, 'a.md');
    const b = hostJoin(root, 'b.md');
    const appeared = hostJoin(root, 'appeared.md');
    writeFileSync(a, 'a2');
    writeFileSync(appeared, 'new');
    const changes = await changedInputs(
      [
        { kind: 'content', path: a, digest: digest('a1') },
        { kind: 'existence', path: a, exists: true },
        { kind: 'content', path: b, digest: digest('b') },
        { kind: 'existence', path: b, exists: true },
        { kind: 'existence', path: appeared, exists: false },
        { kind: 'content', path: hostJoin(root, 'owned/file.ts'), digest: 'x' },
        { kind: 'existence', path: hostJoin(root, 'owned/new.ts'), exists: false },
        {
          kind: 'glob',
          root,
          include: ['*.md', 'owned/**'],
          exclude: [],
          members: [a, b, hostJoin(root, 'owned/old.ts')],
        },
        {
          kind: 'glob',
          root: hostJoin(root, 'absent'),
          include: ['**/*.md'],
          exclude: [],
          members: [hostJoin(root, 'absent/x.md')],
        },
      ],
      [hostJoin(root, 'owned')],
    );
    expect(changes).toEqual(
      [
        { kind: 'update', path: a },
        { kind: 'create', path: appeared },
        { kind: 'delete', path: b },
        // A vanished glob root has no members any more.
        { kind: 'delete', path: hostJoin(root, 'absent/x.md') },
      ].sort((left, right) => left.path.localeCompare(right.path)),
    );
    expect(await changedInputs([], [])).toEqual([]);
  });
});

describe('WatchInputFilter', () => {
  const roots: string[] = [];
  afterEach(() =>
    roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })),
  );
  const result = (
    generation: number,
    status: 'success' | 'failure',
    files: string[],
    globs: WatchInputs['globs'] = [],
  ): BuildResult =>
    status === 'success'
      ? {
          status,
          generation,
          snapshot: undefined as never,
          manifest: undefined as never,
          diagnostics: [],
          whyRebuilt: [],
          watchInputs: { files, globs },
        }
      : { status, generation, diagnostics: [], whyRebuilt: [], watchInputs: { files, globs } };

  it('admits everything until inputs are known, then only recorded inputs', async () => {
    const root = temporaryDirectory('ngdoc-filter-', true);
    roots.push(root);
    const docs = hostJoin(root, 'docs');
    mkdirSync(hostJoin(docs, 'moved-in'), { recursive: true });
    const filter = new WatchInputFilter();
    const change = (kind: FileChange['kind'], path: string) => filter.matches({ kind, path });
    expect(change('update', hostJoin(root, '.angular/cache/x.db'))).toBe(true);
    filter.observe({ status: 'cancelled', generation: 1, diagnostics: [], whyRebuilt: [] });
    filter.observe({ ...result(1, 'failure', []), watchInputs: undefined } as BuildResult);
    filter.observe({ ...result(1, 'success', []), watchInputs: undefined } as BuildResult);
    expect(change('update', hostJoin(root, 'anything'))).toBe(true);
    filter.observe(
      result(
        2,
        'success',
        [hostJoin(root, 'src/page.md')],
        [
          {
            root,
            include: ['docs/**/*.md', `${docs}/**/ng-doc.page.ts`],
            exclude: ['docs/private/**'],
          },
        ],
      ),
    );
    expect(change('update', hostJoin(root, 'src/page.md'))).toBe(true);
    expect(change('update', hostJoin(root, '.angular/cache/x.db'))).toBe(false);
    expect(change('update', hostJoin(root, 'tmp/run/child.log'))).toBe(false);
    expect(change('create', hostJoin(docs, 'new.md'))).toBe(true);
    expect(change('create', hostJoin(docs, 'guide/ng-doc.page.ts'))).toBe(true);
    expect(change('update', hostJoin(docs, 'image.png'))).toBe(false);
    expect(change('create', hostJoin(docs, 'private/secret.md'))).toBe(false);
    // Directory arrival below a glob base (a moved directory is reported once).
    expect(change('create', hostJoin(docs, 'moved-in'))).toBe(true);
    expect(change('create', hostJoin(docs, 'not-a-directory'))).toBe(false);
    // Removal or arrival of an ancestor of a recorded file or glob base, but not its mtime.
    expect(change('delete', hostJoin(root, 'src'))).toBe(true);
    expect(change('create', root)).toBe(true);
    expect(change('update', hostJoin(root, 'src'))).toBe(false);
    // A newer failure unions its inputs; an older result is ignored; success replaces both.
    filter.observe(result(3, 'failure', [hostJoin(root, 'missing.njk')]));
    filter.observe(result(2, 'success', [hostJoin(root, 'stale.md')]));
    expect(change('update', hostJoin(root, 'missing.njk'))).toBe(true);
    expect(change('update', hostJoin(root, 'src/page.md'))).toBe(true);
    expect(change('update', hostJoin(root, 'stale.md'))).toBe(false);
    filter.observe(result(4, 'success', [hostJoin(root, 'next.md')]));
    expect(change('update', hostJoin(root, 'missing.njk'))).toBe(false);
    expect(change('update', hostJoin(root, 'src/page.md'))).toBe(false);
    expect(change('update', hostJoin(root, 'next.md'))).toBe(true);

    const listener = vi.fn();
    const onError = vi.fn();
    const inner = new Events();
    await filterFileEvents(inner, filter).subscribe(listener, onError);
    inner.emit({ kind: 'update', path: hostJoin(root, 'noise.log') });
    expect(listener).not.toHaveBeenCalled();
    inner.emit(
      { kind: 'update', path: hostJoin(root, 'noise.log') },
      { kind: 'update', path: hostJoin(root, 'next.md') },
    );
    expect(listener).toHaveBeenCalledWith([{ kind: 'update', path: hostJoin(root, 'next.md') }]);
    inner.onError!(rescanSignal);
    expect(onError).toHaveBeenCalledWith(rescanSignal);
  });
});

describe('WatchInputFilter replay of inputs recorded by an in-flight generation', () => {
  const roots: string[] = [];
  afterEach(() =>
    roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })),
  );
  const success = (generation: number, files: string[]): BuildResult => ({
    status: 'success',
    generation,
    snapshot: undefined as never,
    manifest: undefined as never,
    diagnostics: [],
    whyRebuilt: [],
    watchInputs: { files, globs: [] },
  });
  const tick = () => new Promise((done) => setTimeout(done, 0));

  it('publishes a snippet edited before the generation that first reads it settles', async () => {
    // Wired as angular/runner.ts wires the session and filter.
    const root = temporaryDirectory('ngdoc-replay-', true);
    roots.push(root);
    const page = hostJoin(root, 'page.md');
    const snippet = hostJoin(root, 'snippets/snippet.md');
    mkdirSync(hostJoin(root, 'snippets'));
    writeFileSync(page, 'v1');
    writeFileSync(snippet, 'snippet v1');
    const h = harness();
    let gate: Promise<void> | undefined;
    let readSnippet = false;
    h.compile.mockImplementation(async (request) => {
      const body = readFileSync(page, 'utf8');
      const dependencies: Dependency[] = [{ kind: 'content', path: page, digest: digest(body) }];
      let included = '';
      if (body.includes('include')) {
        included = readFileSync(snippet, 'utf8');
        dependencies.push({ kind: 'content', path: snippet, digest: digest(included) });
        readSnippet = true;
        await gate;
      }
      return { ...compilation(`${request.generation}:${body}|${included}`), dependencies };
    });
    const session = createBuildSession(h.services, { batchDelayMs: 0 });
    try {
      const filter = new WatchInputFilter();
      const source = new Events();
      const watch = await session.watch(filterFileEvents(source, filter), (event) => {
        if (event.kind === 'started') filter.started();
        if (event.kind === 'result') filter.observe(event.result);
      });
      await watch.initial;
      let open!: () => void;
      gate = new Promise<void>((resolve) => (open = resolve));
      writeFileSync(page, 'v2 include');
      source.emit({ kind: 'update', path: page });
      await until(() => readSnippet);
      writeFileSync(snippet, 'snippet v2');
      source.emit({ kind: 'update', path: snippet });
      expect(filter.retainedCount()).toBe(1);
      open();
      await until(() => h.commit.mock.calls.length === 3);
      expect(h.commit.mock.calls.map(([request]) => request.candidate.revision)).toEqual([
        '1:v1|',
        '2:v2 include|snippet v1',
        '3:v2 include|snippet v2',
      ]);
      expect(h.compile.mock.calls[2][0].changes).toEqual([{ kind: 'update', path: snippet }]);
      expect(filter.retainedCount()).toBe(0);
    } finally {
      await session.dispose();
    }
  });

  it('retains only while a generation is in flight, discards on cancellation and replays only admitted paths', async () => {
    const filter = new WatchInputFilter();
    const replay = vi.fn();
    const reconcile = vi.fn();
    const detach = filter.attach({ replay, reconcile });
    // Unseeded: everything is admitted, nothing is retained.
    filter.started();
    filter.reject({ kind: 'update', path: '/ws/early.md' });
    expect(filter.retainedCount()).toBe(0);
    filter.observe(success(1, ['/ws/page.md']));
    // Idle: rejections are not retained, the recorded inputs are current.
    filter.reject({ kind: 'update', path: '/ws/snippet.md' });
    expect(filter.retainedCount()).toBe(0);
    // In flight: retained per path, replayed after a result that records them.
    filter.started();
    filter.reject({ kind: 'create', path: '/ws/snippet.md' });
    filter.reject({ kind: 'update', path: '/ws/snippet.md' });
    filter.reject({ kind: 'update', path: '/ws/.angular/cache/x.db' });
    expect(filter.retainedCount()).toBe(2);
    filter.observe(success(2, ['/ws/page.md', '/ws/snippet.md']));
    expect(replay).not.toHaveBeenCalled();
    await tick();
    expect(replay).toHaveBeenCalledWith([{ kind: 'update', path: '/ws/snippet.md' }]);
    // A cancelled generation discards what it retained: its successor reads inputs afresh.
    filter.started();
    filter.reject({ kind: 'update', path: '/ws/other.md' });
    filter.observe({ status: 'cancelled', generation: 3, diagnostics: [], whyRebuilt: [] });
    expect(filter.retainedCount()).toBe(0);
    filter.started();
    filter.observe(success(4, ['/ws/other.md']));
    await tick();
    expect(replay).toHaveBeenCalledTimes(1);
    // Detaching clears retained changes and stops delivery.
    filter.started();
    filter.reject({ kind: 'update', path: '/ws/late.md' });
    detach();
    expect(filter.retainedCount()).toBe(0);
    filter.reject({ kind: 'update', path: '/ws/late.md' });
    filter.observe(success(5, ['/ws/late.md']));
    await tick();
    expect(replay).toHaveBeenCalledTimes(1);
    expect(reconcile).not.toHaveBeenCalled();
  });

  it('requests a reconcile instead of retaining more than its capacity', async () => {
    const filter = new WatchInputFilter({ capacity: 2 });
    const replay = vi.fn();
    const reconcile = vi.fn();
    filter.attach({ replay, reconcile });
    filter.observe(success(1, ['/ws/page.md']));
    filter.started();
    for (const name of ['a', 'b', 'c', 'd'])
      filter.reject({ kind: 'update', path: `/ws/${name}.md` });
    expect(filter.retainedCount()).toBe(0);
    filter.observe(success(2, ['/ws/page.md', '/ws/a.md']));
    await tick();
    expect(replay).not.toHaveBeenCalled();
    expect(reconcile).toHaveBeenCalledWith({
      code: WATCHER_RESCAN,
      severity: 'warning',
      stage: 'host',
      message:
        'More than 2 unrecorded workspace paths changed during generation 2. Re-observing every recorded input.',
    });
    // The overflow is per generation.
    filter.started();
    filter.reject({ kind: 'update', path: '/ws/b.md' });
    expect(filter.retainedCount()).toBe(1);
    expect(new WatchInputFilter().retainedCount()).toBe(0);
  });

  it('routes the filtered source through the filter and detaches on dispose or subscribe failure', async () => {
    const filter = new WatchInputFilter();
    filter.observe(success(1, ['/ws/page.md']));
    const inner = new Events();
    const listener = vi.fn();
    const onError = vi.fn();
    const subscription = await filterFileEvents(inner, filter).subscribe(listener, onError);
    filter.started();
    inner.emit({ kind: 'update', path: '/ws/snippet.md' }, { kind: 'update', path: '/ws/page.md' });
    expect(listener).toHaveBeenCalledWith([{ kind: 'update', path: '/ws/page.md' }]);
    expect(filter.retainedCount()).toBe(1);
    filter.observe(success(2, ['/ws/snippet.md']));
    await tick();
    expect(listener).toHaveBeenLastCalledWith([{ kind: 'update', path: '/ws/snippet.md' }]);
    filter.started();
    inner.emit({ kind: 'update', path: '/ws/x.md' });
    await subscription.dispose();
    expect(inner.closed).toBe(1);
    expect(filter.retainedCount()).toBe(0);
    const failing = new Events();
    failing.gate = Promise.reject(new Error('subscribe failed'));
    await expect(filterFileEvents(failing, filter).subscribe(listener, onError)).rejects.toThrow(
      'subscribe failed',
    );
    filter.started();
    filter.reject({ kind: 'update', path: '/ws/y.md' });
    filter.observe(success(3, ['/ws/y.md']));
    await tick();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('WatchInputFilter symlink aliases', () => {
  const roots: string[] = [];
  afterEach(() =>
    roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })),
  );

  it('matches the physical path of a recorded file or glob base reached through a symlink', () => {
    const root = temporaryDirectory('ngdoc-alias-', true);
    roots.push(root);
    mkdirSync(hostJoin(root, 'real/docs'), { recursive: true });
    writeFileSync(hostJoin(root, 'real/x.md'), 'x');
    symlinkSync(hostJoin(root, 'real'), hostJoin(root, 'link'), 'dir');
    const filter = new WatchInputFilter();
    filter.observe({
      status: 'success',
      generation: 1,
      snapshot: undefined as never,
      manifest: undefined as never,
      diagnostics: [],
      whyRebuilt: [],
      watchInputs: {
        files: [hostJoin(root, 'link/x.md'), hostJoin(root, 'link/missing.md')],
        globs: [
          { root: hostJoin(root, 'link/docs'), include: ['**/*.md'], exclude: ['private/**'] },
        ],
      },
    });
    const change = (path: string) => filter.matches({ kind: 'update', path });
    expect(change(hostJoin(root, 'link/x.md'))).toBe(true);
    expect(change(hostJoin(root, 'real/x.md'))).toBe(true);
    expect(change(hostJoin(root, 'real/docs/new.md'))).toBe(true);
    expect(change(hostJoin(root, 'real/docs/private/secret.md'))).toBe(false);
    expect(change(hostJoin(root, 'real/docs/image.png'))).toBe(false);
    expect(change(hostJoin(root, 'real/other.md'))).toBe(false);
    // A missing recorded file under a symlinked directory matches through the directory alias,
    // so its creation at the physical path is seen.
    expect(change(hostJoin(root, 'link/missing.md'))).toBe(true);
    expect(filter.matches({ kind: 'create', path: hostJoin(root, 'real/missing.md') })).toBe(true);
    // Deleting the physical directory behind the symlink matches the recorded directory.
    expect(filter.matches({ kind: 'delete', path: hostJoin(root, 'real') })).toBe(true);
    expect(filter.matches({ kind: 'delete', path: hostJoin(root, 'unrelated') })).toBe(false);
  });

  const result = (generation: number, files: string[]): BuildResult => ({
    status: 'success',
    generation,
    snapshot: undefined as never,
    manifest: undefined as never,
    diagnostics: [],
    whyRebuilt: [],
    watchInputs: { files, globs: [] },
  });

  it('follows a retargeted symlink and a physical directory that appears later', () => {
    const root = temporaryDirectory('ngdoc-retarget-', true);
    roots.push(root);
    mkdirSync(hostJoin(root, 'real1'));
    mkdirSync(hostJoin(root, 'real2'));
    writeFileSync(hostJoin(root, 'real1/x.md'), '1');
    writeFileSync(hostJoin(root, 'real2/x.md'), '2');
    symlinkSync(hostJoin(root, 'real1'), hostJoin(root, 'link'), 'dir');
    const filter = new WatchInputFilter({ root });
    filter.observe(result(1, [hostJoin(root, 'link/x.md'), hostJoin(root, 'later/y.md')]));
    const change = (path: string) => filter.matches({ kind: 'update', path });
    expect(change(hostJoin(root, 'real1/x.md'))).toBe(true);
    expect(change(hostJoin(root, 'real2/x.md'))).toBe(false);
    unlinkSync(hostJoin(root, 'link'));
    symlinkSync(hostJoin(root, 'real2'), hostJoin(root, 'link'), 'dir');
    // The recorded directory 'later' does not exist yet; later it is a symlink to real2.
    symlinkSync(hostJoin(root, 'real2'), hostJoin(root, 'later'), 'dir');
    filter.observe(result(2, [hostJoin(root, 'link/x.md'), hostJoin(root, 'later/y.md')]));
    expect(change(hostJoin(root, 'real2/x.md'))).toBe(true);
    expect(change(hostJoin(root, 'real1/x.md'))).toBe(false);
    expect(filter.matches({ kind: 'create', path: hostJoin(root, 'real2/y.md') })).toBe(true);
  });

  it('keeps a recorded file that is itself a symlink aliased and re-examines a changed file', () => {
    const root = temporaryDirectory('ngdoc-filelink-', true);
    roots.push(root);
    mkdirSync(hostJoin(root, 'store'));
    writeFileSync(hostJoin(root, 'store/target.md'), 't');
    writeFileSync(hostJoin(root, 'plain.md'), 'p');
    symlinkSync(hostJoin(root, 'store/target.md'), hostJoin(root, 'page.md'));
    const filter = new WatchInputFilter({ root });
    filter.observe(result(1, [hostJoin(root, 'page.md'), hostJoin(root, 'plain.md')]));
    expect(filter.matches({ kind: 'update', path: hostJoin(root, 'store/target.md') })).toBe(true);
    expect(filter.matches({ kind: 'update', path: hostJoin(root, 'store/other.md') })).toBe(false);
    // plain.md is replaced by a symlink; its own event makes the next result re-examine it.
    unlinkSync(hostJoin(root, 'plain.md'));
    symlinkSync(hostJoin(root, 'store/target.md'), hostJoin(root, 'plain.md'));
    writeFileSync(hostJoin(root, 'store/plain-target.md'), 'q');
    unlinkSync(hostJoin(root, 'plain.md'));
    symlinkSync(hostJoin(root, 'store/plain-target.md'), hostJoin(root, 'plain.md'));
    expect(filter.matches({ kind: 'update', path: hostJoin(root, 'plain.md') })).toBe(true);
    filter.observe(result(2, [hostJoin(root, 'page.md'), hostJoin(root, 'plain.md')]));
    expect(filter.matches({ kind: 'update', path: hostJoin(root, 'store/plain-target.md') })).toBe(
      true,
    );
  });

  it('needs no alias for a watched root spelled through a symlink (/tmp-style) and stays O(depth) with many aliases', () => {
    // mkdtemp below os.tmpdir() without realpath: on macOS /var/folders/... -> /private/var/...
    const spelled = temporaryDirectory('ngdoc-aliascost-');
    roots.push(spelled);
    const files: string[] = [];
    for (let directory = 0; directory < 180; directory++) {
      const folder = hostJoin(spelled, 'src', `d${directory}`, 'nested');
      mkdirSync(folder, { recursive: true });
      for (let index = 0; index < 100; index++) {
        const file = hostJoin(folder, `f${index}.ts`);
        writeFileSync(file, '');
        files.push(file);
      }
    }
    const rejected = Array.from({ length: 10_000 }, (_, index) => ({
      kind: 'update' as const,
      path: hostJoin(spelled, '.angular/cache/22.0.6/app', `chunk-${index}.db`),
    }));
    const measure = (filter: WatchInputFilter) => {
      filter.observe(result(1, files));
      const started = performance.now();
      const admitted = rejected.filter((change) => filter.matches(change)).length;
      return { admitted, ms: performance.now() - started };
    };
    // Without the watched root every directory is aliased when the spelling differs from its
    // realpath; matching still walks only the event path's ancestors.
    const unrooted = measure(new WatchInputFilter());
    const rooted = measure(new WatchInputFilter({ root: spelled }));
    expect(unrooted.admitted).toBe(0);
    expect(rooted.admitted).toBe(0);
    expect(unrooted.ms).toBeLessThan(500);
    expect(rooted.ms).toBeLessThan(500);
    const filter = new WatchInputFilter({ root: spelled });
    filter.observe(result(1, files));
    expect(filter.matches({ kind: 'update', path: files[1234] })).toBe(true);
    const physicalRoot = hostJoin(realpathSync(spelled));
    if (physicalRoot !== spelled) {
      // Without the root, the physical spelling of a recorded file still matches.
      const unrootedFilter = new WatchInputFilter();
      unrootedFilter.observe(result(1, files));
      expect(
        unrootedFilter.matches({
          kind: 'update',
          path: physicalRoot + files[42].slice(spelled.length),
        }),
      ).toBe(true);
    }
  }, 60_000);
});

describe('WatchInputFilter reconcile when a result records no inputs', () => {
  const tick = () => new Promise((done) => setTimeout(done, 0));
  const noInputs = (generation: number, watchInputs?: WatchInputs): BuildResult => ({
    status: 'failure',
    generation,
    diagnostics: [
      { code: 'WORKER_CRASH', severity: 'error', stage: 'evaluation', message: 'crashed' },
    ],
    whyRebuilt: [],
    ...(watchInputs ? { watchInputs } : {}),
  });
  const success = (generation: number, files: string[]): BuildResult => ({
    status: 'success',
    generation,
    snapshot: undefined as never,
    manifest: undefined as never,
    diagnostics: [],
    whyRebuilt: [],
    watchInputs: { files, globs: [] },
  });

  it('requests a reconcile only when something was retained or overflowed', async () => {
    const filter = new WatchInputFilter({
      capacity: 1,
      reconcileBackoff: { initialMs: 20, maxMs: 40 },
    });
    const replay = vi.fn();
    const reconcile = vi.fn();
    filter.attach({ replay, reconcile });
    filter.observe(success(1, ['/ws/page.md']));
    // Nothing retained: a crash needs no reconcile.
    filter.started();
    filter.observe(noInputs(2));
    await tick();
    expect(reconcile).not.toHaveBeenCalled();
    // A retained change and a result without inputs (compiler throw).
    filter.started();
    filter.reject({ kind: 'update', path: '/ws/snippet.md' });
    filter.observe(noInputs(3));
    await tick();
    expect(reconcile).toHaveBeenLastCalledWith(
      expect.objectContaining({
        code: WATCHER_RESCAN,
        severity: 'warning',
        message: expect.stringContaining('Generation 3 recorded no inputs while 1 unrecorded'),
      }),
    );
    // Empty recorded inputs (worker crash with empty dependencies) after an overflow.
    filter.started();
    filter.reject({ kind: 'update', path: '/ws/a.md' });
    filter.reject({ kind: 'update', path: '/ws/b.md' });
    filter.observe(noInputs(4, { files: [], globs: [] }));
    await tick();
    // The second consecutive reconcile is backed off.
    expect(reconcile).toHaveBeenCalledTimes(1);
    await new Promise((done) => setTimeout(done, 40));
    expect(reconcile).toHaveBeenCalledTimes(2);
    expect(reconcile.mock.calls[1][0].message).toContain('while more than 1 unrecorded');
    expect(reconcile.mock.calls[1][0].message).toContain('after 20 ms (consecutive reconcile 2)');
    // The previous effective inputs still apply.
    expect(filter.matches({ kind: 'update', path: '/ws/page.md' })).toBe(true);
    expect(replay).not.toHaveBeenCalled();
  });

  it('publishes a snippet edit whose generation crashed through the session reconcile', async () => {
    const root = temporaryDirectory('ngdoc-crash-', true);
    try {
      const page = hostJoin(root, 'page.md');
      const snippet = hostJoin(root, 'snippet.md');
      writeFileSync(page, 'v1');
      writeFileSync(snippet, 'snippet v1');
      const h = harness();
      let gate: Promise<void> | undefined;
      let readSnippet = false;
      let crash = false;
      h.compile.mockImplementation(async (request) => {
        const body = readFileSync(page, 'utf8');
        const dependencies: Dependency[] = [{ kind: 'content', path: page, digest: digest(body) }];
        let included = '';
        if (body.includes('include')) {
          included = readFileSync(snippet, 'utf8');
          dependencies.push({ kind: 'content', path: snippet, digest: digest(included) });
          readSnippet = true;
          await gate;
          if (crash) {
            crash = false;
            return {
              dependencies: [],
              diagnostics: [
                {
                  code: 'WORKER_CRASH',
                  severity: 'error',
                  stage: 'evaluation',
                  message: 'crashed',
                },
              ],
              whyRebuilt: [],
            };
          }
        }
        return { ...compilation(`${request.generation}:${body}|${included}`), dependencies };
      });
      const session = createBuildSession(h.services, { batchDelayMs: 0 });
      try {
        const filter = new WatchInputFilter({ root });
        const source = new Events();
        const watch = await session.watch(filterFileEvents(source, filter), (event) => {
          if (event.kind === 'started') filter.started();
          if (event.kind === 'result') filter.observe(event.result);
        });
        await watch.initial;
        let open!: () => void;
        gate = new Promise<void>((resolve) => (open = resolve));
        crash = true;
        writeFileSync(page, 'v2 include');
        source.emit({ kind: 'update', path: page });
        await until(() => readSnippet);
        writeFileSync(snippet, 'snippet v2');
        source.emit({ kind: 'update', path: snippet });
        open();
        await until(() => h.commit.mock.calls.length === 2);
        expect(h.commit.mock.calls.map(([request]) => request.candidate.revision)).toEqual([
          '1:v1|',
          '3:v2 include|snippet v2',
        ]);
      } finally {
        await session.dispose();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('WatchInputFilter bounded no-input reconcile', () => {
  const noInputs = (generation: number): BuildResult => ({
    status: 'failure',
    generation,
    diagnostics: [
      {
        code: 'WORKER_COMPILE_TIMEOUT',
        severity: 'error',
        stage: 'evaluation',
        message: 'deadline',
      },
    ],
    whyRebuilt: [],
    watchInputs: { files: [], globs: [] },
  });
  const success = (generation: number, files: string[]): BuildResult => ({
    status: 'success',
    generation,
    snapshot: undefined as never,
    manifest: undefined as never,
    diagnostics: [],
    whyRebuilt: [],
    watchInputs: { files, globs: [] },
  });
  afterEach(() => vi.useRealTimers());

  it('backs off consecutive reconciles, coalesces, resets and clears its timer on detach', () => {
    vi.useFakeTimers();
    const filter = new WatchInputFilter();
    const reconcile = vi.fn();
    const detach = filter.attach({ replay: vi.fn(), reconcile });
    filter.observe(success(1, ['/ws/page.md']));
    const noisyFailure = (generation: number) => {
      filter.started();
      filter.reject({ kind: 'update', path: '/ws/.idea/workspace.xml' });
      filter.observe(noInputs(generation));
    };
    const delays: number[] = [];
    let generation = 2;
    for (let round = 0; round < 9; round++) {
      noisyFailure(generation++);
      const before = Date.now();
      // Coalesced: further idle noise while a reconcile is scheduled adds nothing.
      filter.reject({ kind: 'update', path: '/ws/.idea/other.xml' });
      vi.advanceTimersToNextTimer();
      delays.push(Date.now() - before);
    }
    expect(delays).toEqual([0, 1000, 2000, 4000, 8000, 16_000, 32_000, 60_000, 60_000]);
    expect(reconcile).toHaveBeenCalledTimes(9);
    expect(reconcile.mock.calls[8][0]).toMatchObject({ code: WATCHER_RESCAN, severity: 'warning' });
    // Idle rejections while inputs are unknown request a reconcile (the fixing edit).
    filter.reject({ kind: 'update', path: '/ws/snippet.md' });
    expect(filter.reconcileScheduled()).toBe(true);
    // A result that records inputs ends the streak and drops the scheduled reconcile.
    filter.started();
    filter.observe(success(generation++, ['/ws/page.md']));
    expect(filter.reconcileScheduled()).toBe(false);
    filter.reject({ kind: 'update', path: '/ws/.idea/workspace.xml' });
    expect(filter.reconcileScheduled()).toBe(false);
    noisyFailure(generation++);
    expect(filter.reconcileScheduled()).toBe(true);
    vi.advanceTimersByTime(0);
    expect(reconcile).toHaveBeenCalledTimes(10);
    // An admitted change also ends the streak.
    noisyFailure(generation++);
    expect(filter.reconcileScheduled()).toBe(true);
    filter.admitted();
    expect(filter.reconcileScheduled()).toBe(false);
    noisyFailure(generation++);
    vi.advanceTimersByTime(0);
    expect(reconcile).toHaveBeenCalledTimes(11);
    // Detach clears a scheduled reconcile; nothing is scheduled without a consumer.
    noisyFailure(generation++);
    expect(filter.reconcileScheduled()).toBe(true);
    detach();
    expect(filter.reconcileScheduled()).toBe(false);
    vi.advanceTimersByTime(120_000);
    expect(reconcile).toHaveBeenCalledTimes(11);
    noisyFailure(generation++);
    expect(filter.reconcileScheduled()).toBe(false);
  });

  it('bounds generations under a persistent no-input failure and unrelated writes, and still publishes the fix', async () => {
    const root = temporaryDirectory('ngdoc-f10-', true);
    let noise: ReturnType<typeof setInterval> | undefined;
    const h = harness();
    const session = createBuildSession(h.services, { batchDelayMs: 0 });
    try {
      const page = hostJoin(root, 'page.md');
      const snippet = hostJoin(root, 'snippet.md');
      writeFileSync(page, 'v1');
      writeFileSync(snippet, 'hang');
      h.compile.mockImplementation(async (request) => {
        const body = readFileSync(page, 'utf8');
        const dependencies: Dependency[] = [{ kind: 'content', path: page, digest: digest(body) }];
        let included = '';
        if (body.includes('include')) {
          included = readFileSync(snippet, 'utf8');
          // A page whose include hangs the compiler until the worker deadline: no inputs. The
          // generation outlasts the noise period, so unrelated writes land during every one.
          await new Promise((done) => setTimeout(done, 30));
          if (included === 'hang')
            return {
              dependencies: [],
              diagnostics: [
                {
                  code: 'WORKER_COMPILE_TIMEOUT',
                  severity: 'error',
                  stage: 'evaluation',
                  message: 'deadline',
                },
              ],
              whyRebuilt: [],
            };
          dependencies.push({ kind: 'content', path: snippet, digest: digest(included) });
        }
        return { ...compilation(`${request.generation}:${body}|${included}`), dependencies };
      });
      // A small backoff keeps the test short: 50 ms doubling to 200 ms.
      const filter = new WatchInputFilter({
        root,
        reconcileBackoff: { initialMs: 50, maxMs: 200 },
      });
      const source = new Events();
      const warnings: string[] = [];
      const watch = await session.watch(filterFileEvents(source, filter), (event) => {
        if (event.kind === 'started') filter.started();
        if (event.kind === 'result') filter.observe(event.result);
        if (event.kind === 'diagnostic') warnings.push(event.diagnostic.code);
      });
      await watch.initial;
      // An IDE keeps writing its unrelated project state every 10 ms.
      let tick = 0;
      noise = setInterval(
        () =>
          source.emit({
            kind: 'update',
            path: hostJoin(root, `.idea/workspace-${tick++ % 3}.xml`),
          }),
        10,
      );
      writeFileSync(page, 'v2 include');
      source.emit({ kind: 'update', path: page });
      await new Promise((done) => setTimeout(done, 1500));
      const generations = h.compile.mock.calls.length;
      // Unbounded, this ran one generation per few ms (hundreds). Bounded: the first reconcile,
      // then 50, 100, 200, 200 ... ms apart: about 9 in 1.5 s.
      expect(generations).toBeLessThanOrEqual(15);
      expect(warnings.length).toBeLessThanOrEqual(13);
      expect(warnings.every((code) => code === WATCHER_RESCAN)).toBe(true);
      // The fix to the failing include is not a recorded input, yet it is published within the
      // capped delay while the noise continues.
      writeFileSync(snippet, 'fixed');
      source.emit({ kind: 'update', path: snippet });
      await until(
        () =>
          h.commit.mock.calls.at(-1)?.[0].candidate.revision.endsWith(':v2 include|fixed') === true,
        2000,
      );
      clearInterval(noise);
      noise = undefined;
      // Recorded inputs end the streak: nothing is scheduled any more.
      await new Promise((done) => setTimeout(done, 50));
      expect(filter.reconcileScheduled()).toBe(false);
    } finally {
      if (noise) clearInterval(noise);
      await session.dispose();
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('WatchInputFilter alias for a missing directory below a symlink', () => {
  it('resolves the nearest existing ancestor', () => {
    const root = temporaryDirectory('ngdoc-f9d-', true);
    try {
      mkdirSync(hostJoin(root, 'target2'));
      symlinkSync(hostJoin(root, 'target2'), hostJoin(root, 'link'), 'dir');
      const filter = new WatchInputFilter({ root });
      filter.observe({
        status: 'success',
        generation: 1,
        snapshot: undefined as never,
        manifest: undefined as never,
        diagnostics: [],
        whyRebuilt: [],
        watchInputs: { files: [hostJoin(root, 'link/sub/new.md')], globs: [] },
      });
      expect(filter.matches({ kind: 'create', path: hostJoin(root, 'target2/sub') })).toBe(true);
      expect(filter.matches({ kind: 'create', path: hostJoin(root, 'target2/sub/new.md') })).toBe(
        true,
      );
      expect(filter.matches({ kind: 'create', path: hostJoin(root, 'target2/sub/other.md') })).toBe(
        false,
      );
      expect(filter.matches({ kind: 'create', path: hostJoin(root, 'elsewhere/sub/new.md') })).toBe(
        false,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
