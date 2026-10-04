import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs, { realpathSync } from 'node:fs';
import { mkdir, mkdtemp, rename, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { type FSWatcher, createServer } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  BuildResult,
  Diagnostic,
  FileChange,
  OutputManifest,
  WatchInputs,
} from '../../contracts';
import { ExternalProbeWatcher, MAX_EXTERNAL_PROBES, probeState } from '../external-probes';
import { HostUpdateCoordinator } from '../host-updates';
import { acquireOutputLease } from '../lease';
import { ViteAdapterLifecycle } from '../lifecycle';
import { MAX_MISSING_PATH_DIRECTORIES, MissingPathWatcher } from '../missing-paths';
import { NGDOC_VITE_WATCHER, TRAILING_RESTAT_MS, ViteFileEventSource } from '../vite-event-source';
import { WatchInputRegistry } from '../watch-inputs';

/**
 * Watch scope units: where the event source places each physical target (native watcher or
 * external probe poller), the poller itself, and which hot updates the adapter announces itself.
 */

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const normalize = (value: string) => path.resolve(value).replace(/\\/g, '/');

async function directory(): Promise<string> {
  const runtime = path.join(import.meta.dirname, '.runtime');
  await mkdir(runtime, { recursive: true });
  const root = realpathSync(await mkdtemp(path.join(runtime, 'ng-doc-watch-scope-unit-')));
  temporary.push(root);
  return root;
}

class FakeWatcher extends EventEmitter {
  readonly added: string[] = [];
  /** chokidar's backend flag: FSEvents unless a test says otherwise, `null` for none at all. */
  constructor(readonly options: { useFsEvents?: boolean } | null = { useFsEvents: true }) {
    super();
  }
  add(values: string | readonly string[]): this {
    this.added.push(...(typeof values === 'string' ? [values] : values));
    return this;
  }
}

/**
 * Resolves once `changes` holds a change of `probe`, an input in the directory under test: that
 * directory's watch is live then. Linux's inotify watch is live when `fs.watch` returns, but macOS
 * starts a directory watch asynchronously and signals nothing.
 */
async function reportedOnce(probe: string, changes: readonly FileChange[]): Promise<void> {
  let round = 0;
  await vi.waitFor(
    async () => {
      if (!changes.some((change) => change.path === probe)) {
        await writeFile(probe, String(round++));
        throw new Error(`${probe} is not reported yet`);
      }
    },
    { timeout: 10_000, interval: 50 },
  );
}

let staged = 0;

/**
 * Writes `file` in one step (a rename of a complete file staged in `root`), as an editor's save
 * does: a watcher that reads it between the truncation and the write of a plain `writeFile` would
 * see two states, and so report a creation and a change for one edit.
 * @param root The directory to stage in, on the file's filesystem.
 * @param file The file.
 * @param text Its new content.
 */
async function publish(root: string, file: string, text: string): Promise<void> {
  const stage = path.join(root, `.staged-${++staged}`);
  await writeFile(stage, text);
  await rename(stage, file);
}

/**
 * Saves `file` in place, as VS Code does: truncated, then written. A watcher may see the empty
 * file between the two.
 * @param file The file.
 * @param text Its new content.
 */
async function saveInPlace(file: string, text: string): Promise<void> {
  await writeFile(file, '');
  await writeFile(file, text);
}

/**
 * Resolves once `watcher` recorded the current state of `target`, so its last report saw the
 * final bytes, and that report was delivered to `changes`.
 * @param watcher The missing-path watcher.
 * @param target The watched path.
 * @param changes The delivered changes, as they grow.
 */
async function settled(
  watcher: MissingPathWatcher,
  target: string,
  changes: () => readonly FileChange[],
): Promise<void> {
  const states = (watcher as unknown as { states: Map<string, string> }).states;
  await vi.waitFor(
    () => {
      expect(states.get(target)).toBe(probeState(target));
      expect(changes().filter((change) => change.path === target).length).toBeGreaterThan(0);
    },
    { timeout: 10_000 },
  );
}

/**
 * The reports of one in-place save of `target`: the first is `first`, every other one a change.
 * @param changes The delivered changes since the save started.
 * @param target The saved path.
 * @param first The kind of its first report.
 */
function inPlaceReports(changes: readonly FileChange[], target: string, first: FileChange['kind']) {
  const reports = changes.filter((change) => change.path === target);
  expect(reports[0]).toEqual({ kind: first, path: target });
  expect(reports.slice(1).every((change) => change.kind === 'update')).toBe(true);
}

function success(generation: number, watchInputs: WatchInputs): BuildResult {
  return {
    status: 'success',
    generation,
    snapshot: undefined as never,
    manifest: undefined as never,
    diagnostics: [],
    whyRebuilt: [],
    watchInputs,
  };
}

describe('watch scope: target placement and the probe poller', () => {
  it('polls files outside the workspace and keeps directories, glob members and overflow native', async () => {
    const parent = await directory();
    const root = path.join(parent, 'ws');
    const docs = path.join(root, 'docs');
    const external = path.join(parent, 'external');
    await mkdir(docs, { recursive: true });
    await mkdir(external, { recursive: true });
    const watcher = new FakeWatcher();
    const source = new ViteFileEventSource(watcher as unknown as FSWatcher, 100_000, {
      workspaceRoot: root,
      probeIntervalMs: 60_000,
    });
    const changes: FileChange[] = [];
    const subscription = await source.subscribe(
      (events) => changes.push(...events),
      () => {},
    );
    const probes = Array.from({ length: MAX_EXTERNAL_PROBES + 3 }, (_, index) =>
      normalize(path.join(parent, `probe-${String(index).padStart(4, '0')}.json`)),
    );
    const inside = [
      normalize(path.join(docs, 'page.md')),
      normalize(path.join(root, '.editorconfig')),
    ];
    const member = normalize(path.join(external, 'page.md'));
    await source.seed(1, {
      files: [...inside, member, ...probes],
      globs: [
        { root, include: ['docs/**/*.md'], exclude: [] },
        { root: parent, include: ['external/**/*.md'], exclude: [] },
      ],
    });
    // Workspace files, both glob bases (one outside) and the member below the outside base are
    // native; the rest of the outside files are polled up to the bound, then native again.
    expect(watcher.added.sort()).toEqual(
      [
        ...inside,
        normalize(docs),
        normalize(external),
        member,
        ...probes.slice(MAX_EXTERNAL_PROBES),
      ].sort(),
    );

    // A polled probe that appears is forwarded as a creation, exactly once.
    await writeFile(probes[0]!, '{}');
    const poller = (source as unknown as { probes: ExternalProbeWatcher }).probes;
    await poller.poll();
    await poller.poll();
    expect(changes).toEqual([{ kind: 'create', path: probes[0] }]);
    await subscription.dispose();
  });

  it('watches everything natively without a workspace root or with a filesystem-root one', async () => {
    for (const workspaceRoot of [undefined, '/']) {
      const watcher = new FakeWatcher();
      const source = new ViteFileEventSource(watcher as unknown as FSWatcher, 100, {
        ...(workspaceRoot ? { workspaceRoot } : {}),
      });
      await source.seed(1, {
        files: ['/outside/.editorconfig', '/outside/package.json'],
        globs: [],
      });
      expect(watcher.added).toEqual(['/outside/.editorconfig', '/outside/package.json']);
      await source.dispose();
    }
  });

  it('watches the missing inputs a throttling watcher cannot report through their nearest directories', async () => {
    const root = await directory();
    const docs = path.join(root, 'docs');
    const served = path.join(root, 'src');
    await mkdir(docs);
    await mkdir(served);
    const existing = normalize(path.join(root, 'package.json'));
    await writeFile(existing, '{}');
    const siblings = [
      normalize(path.join(root, '.editorconfig')),
      normalize(path.join(root, '.prettierrc')),
    ];
    const nested = normalize(path.join(root, 'missing/deeper/tsconfig.json'));
    const ready = normalize(path.join(root, '.ready'));
    const member = normalize(path.join(docs, 'new.md'));
    const underRoot = normalize(path.join(served, 'missing.ts'));
    // The fs.watch backend says so; a watcher that does not say is assumed to throttle too.
    for (const watcher of [new FakeWatcher({ useFsEvents: false }), new FakeWatcher(null)]) {
      const source = new ViteFileEventSource(watcher as unknown as FSWatcher, 100, {
        workspaceRoot: root,
        watchedRoots: [served],
      });
      const changes: FileChange[] = [];
      const subscription = await source.subscribe(
        (events) => changes.push(...events),
        () => {},
      );
      await source.seed(1, {
        files: [existing, ...siblings, nested, ready, member, underRoot],
        globs: [{ root, include: ['docs/**/*.md'], exclude: [] }],
      });
      // Existing files, glob bases and their members stay native; the watched root's own watch
      // covers its missing file. The other missing inputs share one directory watch.
      expect(watcher.added.sort()).toEqual([existing, normalize(docs), member].sort());
      const missing = (source as unknown as { missing: MissingPathWatcher }).missing;
      expect(missing.directories).toBe(1);
      await reportedOnce(ready, changes);
      // The probe's earlier writes may still be reported after it was seen once.
      const reported = () => changes.filter((change) => change.path !== ready);

      await publish(root, siblings[1]!, 'root = true');
      await vi.waitFor(() => expect(reported()).toEqual([{ kind: 'create', path: siblings[1] }]), {
        timeout: 10_000,
      });
      // The host watcher's report of the same path is left to the directory watch.
      expect(source.forward({ kind: 'create', path: siblings[1]! })).toBe(false);
      await mkdir(path.dirname(nested), { recursive: true });
      await publish(root, nested, '{}');
      await vi.waitFor(() => expect(reported().at(-1)).toEqual({ kind: 'create', path: nested }), {
        timeout: 10_000,
      });
      expect(reported()).toHaveLength(2);
      // An in-place save (VS Code's): created, then changed; the watch settles on the final bytes.
      const before = changes.length;
      await saveInPlace(siblings[0]!, 'root = true\n');
      await settled(missing, siblings[0]!, () => changes.slice(before));
      await vi.waitFor(() => inPlaceReports(changes.slice(before), siblings[0]!, 'create'), {
        timeout: 10_000,
      });
      await subscription.dispose();
      expect(missing.directories).toBe(0);
      await rm(siblings[0]!);
      await rm(siblings[1]!);
      await rm(ready);
      await rm(path.join(root, 'missing'), { recursive: true });
    }
  });

  it('shares one watch among thousands of missing inputs and follows their directories', async () => {
    const root = await directory();
    const folder = path.join(root, 'a');
    await mkdir(folder);
    const changes: FileChange[] = [];
    const watcher = new MissingPathWatcher((change) => changes.push(change));
    const many = Array.from({ length: 3_000 }, (_, index) =>
      normalize(path.join(root, `probe-${index}.ts`)),
    );
    const target = normalize(path.join(folder, 'b.ts'));
    const ready = normalize(path.join(folder, 'ready.ts'));
    expect(watcher.add([...many, target, ready])).toEqual([]);
    expect(watcher.size).toBe(3_002);
    expect(watcher.directories).toBe(2);
    // Its directory goes: the input moves up to the root's watch, and a new one is followed.
    await rm(folder, { recursive: true });
    await vi.waitFor(() => expect(watcher.directories).toBe(1), { timeout: 10_000 });
    await mkdir(folder);
    await vi.waitFor(() => expect(watcher.directories).toBe(2), { timeout: 10_000 });
    await reportedOnce(ready, changes);
    // The probe's earlier writes may still be reported after it was seen once.
    const reported = () => changes.filter((change) => change.path !== ready);
    await publish(root, target, 'export {};');
    await vi.waitFor(() => expect(reported()).toEqual([{ kind: 'create', path: target }]), {
      timeout: 10_000,
    });
    await publish(root, target, 'export const changed = true;');
    await vi.waitFor(() => expect(reported().at(-1)).toEqual({ kind: 'update', path: target }), {
      timeout: 10_000,
    });
    // An in-place save (VS Code's): changes only, and the watch settles on the final bytes.
    const before = changes.length;
    await saveInPlace(target, 'export const savedInPlace = true;');
    await settled(watcher, target, () => changes.slice(before));
    await vi.waitFor(() => inPlaceReports(changes.slice(before), target, 'update'), {
      timeout: 10_000,
    });
    await rm(target);
    await vi.waitFor(() => expect(reported().at(-1)).toEqual({ kind: 'delete', path: target }), {
      timeout: 10_000,
    });
    watcher.dispose();
    expect(watcher.directories).toBe(0);
    const count = changes.length;
    expect(watcher.add([target])).toEqual([target]);
    await writeFile(target, 'late');
    // Created, changed (once by the atomic save, at least once by the in-place one), deleted.
    const kinds = reported().map((change) => change.kind);
    expect(kinds[0]).toBe('create');
    expect(kinds.at(-1)).toBe('delete');
    expect(kinds.slice(1, -1).every((kind) => kind === 'update')).toBe(true);
    expect(kinds.length).toBeGreaterThanOrEqual(4);
    expect(changes).toHaveLength(count);
    // Real watches on a loaded machine: each step above may wait up to its own 10 s.
  }, 60_000);

  it('reports the inputs that exceed its directory budget', async () => {
    const root = await directory();
    await mkdir(path.join(root, 'one'));
    await mkdir(path.join(root, 'two'));
    const [a, b, c] = ['one/a.ts', 'one/b.ts', 'two/c.ts'].map((file) =>
      normalize(path.join(root, file)),
    );
    const watcher = new MissingPathWatcher(
      () => undefined,
      1,
      () => {
        const handle = new EventEmitter() as unknown as fs.FSWatcher;
        Object.assign(handle, { close: () => undefined });
        return handle;
      },
    );
    expect(watcher.add([a!, b!, c!])).toEqual([c]);
    expect(watcher.directories).toBe(1);
    watcher.dispose();
  });

  it("reports inotify's event sequences once each, whatever the order they arrive in", async () => {
    // Linux's sequences, replayed deterministically: a rename arrives as two events (the old name
    // leaving, the new one arriving), and a file created in a new directory before that
    // directory's watch exists gets no event of its own.
    const root = await directory();
    const nested = normalize(path.join(root, 'a/b.ts'));
    const target = normalize(path.join(root, 'c.ts'));
    const handles = new Map<string, (event: string, name: string | null) => void>();
    const changes: FileChange[] = [];
    const watcher = new MissingPathWatcher(
      (change) => changes.push(change),
      MAX_MISSING_PATH_DIRECTORIES,
      (directory, listener) => {
        handles.set(normalize(directory), listener);
        const handle = new EventEmitter() as unknown as fs.FSWatcher;
        Object.assign(handle, { close: () => handles.delete(normalize(directory)) });
        return handle;
      },
    );
    expect(watcher.add([nested, target])).toEqual([]);
    expect([...handles.keys()]).toEqual([normalize(root)]);
    const emit = (directory: string, event: string, name: string | null) =>
      handles.get(normalize(directory))!(event, name);

    // The directory and its file exist before the new directory is watched: only the directory's
    // own creation is reported, by the watch of its parent.
    await mkdir(path.dirname(nested));
    await writeFile(nested, 'export {};');
    emit(root, 'rename', 'a');
    expect([...handles.keys()].sort()).toEqual([normalize(root), path.dirname(nested)].sort());
    expect(changes).toEqual([{ kind: 'create', path: nested }]);

    // A rename into place: the staged name leaves (no input of its own), then the input arrives.
    const stage = path.join(root, '.c.ts.tmp');
    await writeFile(stage, 'export const c = 1;');
    await rename(stage, target);
    emit(root, 'rename', path.basename(stage));
    expect(changes).toHaveLength(1);
    emit(root, 'rename', 'c.ts');
    expect(changes.at(-1)).toEqual({ kind: 'create', path: target });
    // A replacement by rename reports both halves under the input's own name: one update.
    await writeFile(stage, 'export const c = 2;');
    await rename(stage, target);
    emit(root, 'rename', 'c.ts');
    emit(root, 'rename', 'c.ts');
    // An event that names no file (some platforms) re-reads every input of the directory.
    emit(root, 'change', null);
    expect(changes.slice(2)).toEqual([{ kind: 'update', path: target }]);

    // The new directory and its file go together: one deletion, reported once it is re-anchored.
    await rm(path.dirname(nested), { recursive: true });
    emit(path.dirname(nested), 'rename', 'b.ts');
    emit(root, 'rename', 'a');
    expect(changes.slice(3)).toEqual([{ kind: 'delete', path: nested }]);
    expect([...handles.keys()]).toEqual([normalize(root)]);
    watcher.dispose();
    expect(handles.size).toBe(0);
  });

  it('keeps missing inputs beyond the directory budget native and says so', async () => {
    const root = await directory();
    const count = MAX_MISSING_PATH_DIRECTORIES + 3;
    const targets: string[] = [];
    for (let index = 0; index < count; index++) {
      const folder = path.join(root, `d${String(index).padStart(4, '0')}`);
      await mkdir(folder);
      // Two missing inputs per directory: thousands of paths, one watch per directory.
      targets.push(normalize(path.join(folder, 'a.ts')), normalize(path.join(folder, 'b.ts')));
    }
    const watcher = new FakeWatcher({ useFsEvents: false });
    const source = new ViteFileEventSource(watcher as unknown as FSWatcher, 100_000, {
      workspaceRoot: root,
    });
    await source.seed(1, { files: targets, globs: [] });
    const missing = (source as unknown as { missing: MissingPathWatcher }).missing;
    expect(missing.directories).toBe(MAX_MISSING_PATH_DIRECTORIES);
    expect(missing.size).toBe(MAX_MISSING_PATH_DIRECTORIES * 2);
    expect(watcher.added).toEqual(targets.slice(MAX_MISSING_PATH_DIRECTORIES * 2));
    // Raised before anyone listened: delivered on subscription.
    const diagnostics: Diagnostic[] = [];
    const subscription = await source.subscribe(
      () => {},
      (diagnostic) => diagnostics.push(diagnostic),
    );
    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: NGDOC_VITE_WATCHER,
        severity: 'warning',
        message: expect.stringContaining(`6 missing NgDoc input(s) could not be watched`),
      }),
    ]);
    await subscription.dispose();
    expect(missing.directories).toBe(0);
  }, 60_000);

  it('leaves missing inputs to the host when it does not watch', async () => {
    const root = await directory();
    const target = normalize(path.join(root, '.editorconfig'));
    const watcher = new FakeWatcher({ useFsEvents: false });
    const source = new ViteFileEventSource(watcher as unknown as FSWatcher, 100, {
      workspaceRoot: root,
      watchMissingPaths: false,
    });
    await source.seed(1, { files: [target], globs: [] });
    expect(watcher.added).toEqual([target]);
    await source.dispose();
  });

  it('treats the workspace root through its real path as inside', async () => {
    const parent = await directory();
    const real = path.join(parent, 'real');
    const link = path.join(parent, 'link');
    await mkdir(real);
    await symlink(real, link, 'dir');
    const watcher = new FakeWatcher();
    const source = new ViteFileEventSource(watcher as unknown as FSWatcher, 100, {
      workspaceRoot: link,
    });
    const file = normalize(path.join(real, 'page.md'));
    await source.seed(1, { files: [file], globs: [] });
    expect(watcher.added).toEqual([file]);
    await source.dispose();
  });

  it('reports creation, change and removal of a probe, and nothing after disposal', async () => {
    const root = await directory();
    const file = path.join(root, 'missing/.editorconfig');
    const existing = path.join(root, 'package.json');
    await writeFile(existing, '{}');
    const changes: FileChange[] = [];
    // The passes are driven here: a timed pass could see a write half done (a truncated file is a
    // change of its own) and report one edit twice. The timer is covered by the next test.
    const poller = new ExternalProbeWatcher((change) => changes.push(change), 60_000);
    poller.add([file, existing]);
    poller.add([file]);
    expect(poller.size).toBe(2);
    await poller.poll();
    expect(changes).toEqual([]);
    await mkdir(path.dirname(file));
    await writeFile(file, 'root = true');
    await poller.poll();
    expect(changes).toEqual([{ kind: 'create', path: file }]);
    await writeFile(existing, '{"name":"changed"}');
    await poller.poll();
    expect(changes.at(-1)).toEqual({ kind: 'update', path: existing });
    await rm(path.dirname(file), { recursive: true });
    await poller.poll();
    expect(changes.at(-1)).toEqual({ kind: 'delete', path: file });
    // Overlapping passes do not report twice.
    await writeFile(existing, '{"name":"again"}');
    await Promise.all([poller.poll(), poller.poll()]);
    expect(changes.filter((change) => change.path === existing)).toHaveLength(2);
    poller.dispose();
    const count = changes.length;
    await writeFile(existing, '{"name":"late"}');
    poller.add([file]);
    await poller.poll();
    expect(changes).toHaveLength(count);
    expect(poller.size).toBe(0);
  });

  it('polls on its interval', async () => {
    const root = await directory();
    const file = path.join(root, '.prettierrc');
    const staged = path.join(root, 'staged.tmp');
    const changes: FileChange[] = [];
    const poller = new ExternalProbeWatcher((change) => changes.push(change), 20);
    poller.add([file]);
    await writeFile(staged, '{}');
    // A rename publishes the file in one step: every pass sees it either missing or complete.
    await rename(staged, file);
    await vi.waitFor(() => expect(changes).toEqual([{ kind: 'create', path: file }]), {
      timeout: 10_000,
    });
    poller.dispose();
  });

  it('reports a probe whose lookup fails with an unexpected error as a change', async () => {
    const root = await directory();
    const blocked = path.join(root, 'blocked');
    const file = path.join(blocked, 'package.json');
    await mkdir(blocked);
    await writeFile(file, '{}');
    const changes: FileChange[] = [];
    const poller = new ExternalProbeWatcher((change) => changes.push(change), 60_000);
    poller.add([file]);
    // A directory that cannot be searched: the probe's state is an error, not "missing".
    await fs.promises.chmod(blocked, 0o000);
    try {
      await poller.poll();
    } finally {
      await fs.promises.chmod(blocked, 0o755);
    }
    if (process.getuid?.() === 0) return; // root ignores the mode
    expect(changes).toEqual([{ kind: 'update', path: file }]);
    poller.dispose();
  });

  it('keeps the glob-directory targets apart from recorded files', async () => {
    const root = await directory();
    const registry = new WatchInputRegistry(100);
    const observed = await registry.observe(
      success(1, {
        files: [normalize(path.join(root, 'a.md'))],
        globs: [{ root, include: ['missing/**/*.md'], exclude: [] }],
      }),
    );
    expect(observed.directories).toEqual([normalize(root)]);
    expect(registry.underGlobBase(path.join(root, 'missing/x.md'))).toBe(true);
    expect(registry.underGlobBase(path.join(root, 'a.md'))).toBe(false);
  });
});

describe("watch scope: a write chokidar's change throttle dropped", () => {
  /**
   * An event source on `watcher` whose only input is `file`, and the changes it delivers.
   * @param root The workspace root.
   * @param file The input.
   * @param watcher The host watcher.
   */
  async function watched(root: string, file: string, watcher: FSWatcher) {
    const source = new ViteFileEventSource(watcher, 100, { workspaceRoot: root });
    await source.seed(1, { files: [file], globs: [] });
    const changes: FileChange[] = [];
    const subscription = await source.subscribe(
      (events) => changes.push(...events),
      () => {},
    );
    return { source, changes, subscription };
  }

  it('reports a file again when it is written after its forwarded change, and only then', async () => {
    const root = await directory();
    const file = normalize(path.join(root, 'index.md'));
    await writeFile(file, '');
    const { source, changes, subscription } = await watched(
      root,
      file,
      new FakeWatcher() as unknown as FSWatcher,
    );
    // The truncation is reported; the write that follows within chokidar's window is not.
    expect(source.forward({ kind: 'update', path: file })).toBe(true);
    await writeFile(file, '# Saved\n');
    await vi.waitFor(() => expect(changes).toHaveLength(2), { timeout: 5_000 });
    expect(changes).toEqual([
      { kind: 'update', path: file },
      { kind: 'update', path: file },
    ]);
    // A change with no later write is reported once.
    expect(source.forward({ kind: 'update', path: file })).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, TRAILING_RESTAT_MS * 3));
    expect(changes).toHaveLength(3);
    // A later write that was reported restarts the check from its own state.
    await writeFile(file, '# Saved again\n');
    expect(source.forward({ kind: 'update', path: file })).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, TRAILING_RESTAT_MS * 3));
    expect(changes).toHaveLength(4);
    // A deletion is chokidar's to report; nothing is checked after disposal.
    expect(source.forward({ kind: 'update', path: file })).toBe(true);
    await rm(file);
    await new Promise((resolve) => setTimeout(resolve, TRAILING_RESTAT_MS * 3));
    expect(changes).toHaveLength(5);
    await writeFile(file, 'one');
    expect(source.forward({ kind: 'update', path: file })).toBe(true);
    await subscription.dispose();
    await writeFile(file, 'two');
    await new Promise((resolve) => setTimeout(resolve, TRAILING_RESTAT_MS * 3));
    expect(changes).toHaveLength(6);
  });

  it("reports the final bytes of an in-place save through Vite's own watcher", async () => {
    const root = await directory();
    const file = normalize(path.join(root, 'index.md'));
    await writeFile(file, 'initial');
    const server = await createServer({
      root,
      cacheDir: path.join(root, '.vite/node_modules/.vite'),
      configFile: false,
      logLevel: 'silent',
      server: { middlewareMode: true, hmr: false },
    });
    try {
      const { source, changes, subscription } = await watched(root, file, server.watcher);
      let onChange: (() => void) | undefined;
      server.watcher.on('change', (value) => {
        if (normalize(value) !== file) return;
        source.forward({ kind: 'update', path: file });
        onChange?.();
      });
      // The watch is live once a write is reported.
      await vi.waitFor(
        async () => {
          await writeFile(file, `probe ${Date.now()}`);
          await new Promise((resolve) => setTimeout(resolve, 100));
          expect(changes.length).toBeGreaterThan(0);
        },
        { timeout: 10_000, interval: 200 },
      );
      await new Promise((resolve) => setTimeout(resolve, TRAILING_RESTAT_MS * 3));
      // An in-place save whose write lands inside chokidar's window: written as soon as the
      // truncation is reported, so chokidar does not report it.
      const reported = changes.length;
      const written = new Promise<void>((resolve) => {
        onChange = () => {
          // The truncation's report, not a late report of a probe.
          if (fs.readFileSync(file, 'utf8') !== '') return;
          onChange = undefined;
          void writeFile(file, '# The whole saved page\n').then(resolve);
        };
      });
      await writeFile(file, '');
      await written;
      const after = changes.length;
      expect(after).toBeGreaterThan(reported);
      await vi.waitFor(() => expect(changes.length).toBeGreaterThan(after), { timeout: 5_000 });
      expect(fs.readFileSync(file, 'utf8')).toBe('# The whole saved page\n');
      await subscription.dispose();
    } finally {
      await server.close();
    }
  }, 30_000);
});

describe('watch scope: which hot updates the adapter announces itself', () => {
  /**
   *
   * @param generation
   * @param digest
   */
  function manifest(generation: number, digest: string): OutputManifest {
    return {
      schemaVersion: 1,
      projectId: 'project',
      generation,
      revision: String(generation),
      files: [{ path: 'pages/a.mjs', role: 'content', digest }],
    } as OutputManifest;
  }

  it('claims a committed generated output only, and nothing once disposed', async () => {
    const root = await directory();
    const output = path.join(root, 'out');
    const module = path.join(output, 'pages/a.mjs');
    await mkdir(path.dirname(module), { recursive: true });
    await writeFile(module, 'v1');
    const digest = (value: string) => createHash('sha256').update(value).digest('hex');
    const coordinator = new HostUpdateCoordinator(
      () => {},
      () => {},
    );
    coordinator.seed(output, manifest(1, digest('v1')));
    coordinator.started(2, [{ kind: 'update', path: path.join(root, 'docs/a.md') }]);
    await writeFile(module, 'v2');
    coordinator.result({
      status: 'success',
      generation: 2,
      snapshot: undefined as never,
      manifest: manifest(2, digest('v2')),
      diagnostics: [],
      whyRebuilt: [],
    });
    const generatedRead = () => 'v2';
    const generated = coordinator.begin(module, 'update', generatedRead, false);
    await generated.ready;
    const sourceRead = () => 'source';
    // A pending source ticket rejects once the coordinator is disposed below.
    void coordinator
      .begin(path.join(root, 'docs/a.md'), 'update', sourceRead, true)
      .ready.catch(() => {});
    const strayRead = () => 'stray';
    const stray = coordinator.begin(
      path.join(output, 'pages/stray.mjs'),
      'update',
      strayRead,
      false,
    );
    await stray.ready;
    expect(coordinator.announces(generatedRead)).toBe(true);
    expect(coordinator.announces(sourceRead)).toBe(false);
    expect(coordinator.announces(strayRead)).toBe(false);
    expect(coordinator.announces(() => 'unknown')).toBe(false);
    coordinator.dispose();
    expect(coordinator.announces(generatedRead)).toBe(false);
  });

  it('never claims one after disposal', async () => {
    const root = await directory();
    const lifecycle = new ViteAdapterLifecycle(
      acquireOutputLease(`watch-scope-${Date.now()}-${Math.random()}`, path.join(root, 'out')),
    );
    const hostUpdates = (lifecycle as unknown as { hostUpdates: HostUpdateCoordinator })
      .hostUpdates;
    const announces = vi.spyOn(hostUpdates, 'announces').mockReturnValue(true);
    expect(lifecycle.hostUpdateAnnounced(() => '')).toBe(true);
    (lifecycle as unknown as { disposed: boolean }).disposed = true;
    expect(lifecycle.hostUpdateAnnounced(() => '')).toBe(false);
    announces.mockRestore();
  });
});
