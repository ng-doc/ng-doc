import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { FSWatcher } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BuildResult, OutputManifest } from '../../contracts';
import { HostUpdateCoordinator } from '../host-updates';
import { watchOutputRoot } from '../output-watch';

/**
 * Unit cases of the two structural-edit fixes; `page-tabs*.vitest.ts` run them on a real
 * Vite/Analog host. An output root outside the Vite root is watched as a whole, and a claimed
 * source that no compiled generated update can witness is released with its generation.
 */

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function directory(): Promise<string> {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'ngdoc-structural-')));
  roots.push(root);
  return root;
}

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

function manifest(generation: number, files: Array<[string, string]>): OutputManifest {
  return {
    schemaVersion: 1,
    projectId: 'structural',
    revision: `r${generation}`,
    generation,
    files: files.map(([file, bytes]) => ({
      path: file,
      digest: digest(bytes),
      role: file === 'routes.ts' ? 'routes' : 'angular',
      ownerId: 'aggregate:structural',
    })),
  };
}

function success(generation: number, value: OutputManifest) {
  return { status: 'success', generation, manifest: value } as unknown as Extract<
    BuildResult,
    { status: 'success' }
  >;
}

/**
 * A chokidar double: `add` records, and `getWatched` lists the directories `attach` attached with
 * the entries their reads have listed so far.
 * @param options Whether the double has `getWatched` at all.
 * @param options.getWatched
 */
function watcher(options: { getWatched?: boolean } = {}) {
  const added: string[] = [];
  const watched: Record<string, string[]> = {};
  const value = {
    add: vi.fn((target: string) => void added.push(target)),
    ...(options.getWatched === false ? {} : { getWatched: () => ({ ...watched }) }),
  };
  return {
    watcher: value as unknown as FSWatcher,
    added,
    attach: (directory: string, ...names: string[]) => {
      watched[directory] = [...(watched[directory] ?? []), ...names];
    },
  };
}

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('watchOutputRoot', () => {
  it('reads again each directory inside the Vite root whose read missed an output, and waits', async () => {
    // The initial commit ran while chokidar scanned the Vite root: with the `fs.watch` backend
    // (Linux) a file published between a directory's read and its watch is never listed.
    const root = await directory();
    const output = path.join(root, 'generated');
    const slash = (value: string) => value.replace(/\\/g, '/');
    const double = watcher();
    // Each directory misses a published entry: unlisted, or read without it.
    double.attach(path.join(output, 'guides'), 'guide');
    double.attach(output, 'routes.ts');
    let settled: string | undefined;
    const watching = watchOutputRoot(double.watcher, root, output, [
      'routes.ts',
      'guides/guide/page.ts',
      'guides/other.ts',
    ]).then((value) => {
      settled = value;
    });
    expect(double.added).toEqual(
      [output, path.join(output, 'guides/guide'), path.join(output, 'guides')].map(slash),
    );
    double.attach(output, 'guides');
    double.attach(path.join(output, 'guides'), 'other.ts');
    await tick(60);
    // A directory whose read has not listed its published file yet: not watched.
    expect(settled).toBeUndefined();
    double.attach(path.join(output, 'guides/guide'), 'page.ts');
    await watching;
    expect(settled).toBe('watched');

    // Spelled through a symlink, the output is read in the Vite root's spelling, as chokidar
    // lists it; with nothing published there is nothing to read again.
    const link = path.join(await directory(), 'link');
    await symlink(root, link, 'dir');
    const linked = watcher();
    await mkdir(output);
    let linkedSettled: string | undefined;
    const linkedWatching = watchOutputRoot(linked.watcher, root, path.join(link, 'generated'), [
      'routes.ts',
    ]).then((value) => {
      linkedSettled = value;
    });
    expect(linked.added).toEqual([slash(output)]);
    linked.attach(output, 'routes.ts');
    await linkedWatching;
    expect(linkedSettled).toBe('watched');
    const empty = watcher();
    await expect(watchOutputRoot(empty.watcher, link, output, [])).resolves.toBe('watched');
    expect(empty.added).toEqual([]);
    // Everything listed already: nothing is read again (another listener on a directory would
    // read it once more on each of its events).
    const listed = watcher();
    listed.attach(output, 'routes.ts');
    await expect(watchOutputRoot(listed.watcher, root, output, ['routes.ts'])).resolves.toBe(
      'watched',
    );
    expect(listed.added).toEqual([]);
  });

  it('adds an outside output root and waits until every directory has been read', async () => {
    const root = await directory();
    const output = path.join(await directory(), 'generated');
    const double = watcher();
    let settled: string | undefined;
    const watching = watchOutputRoot(double.watcher, path.join(root, 'src'), output, [
      'routes.ts',
      'guides/guide/page.ts',
      'guides\\guide\\index\\page.ts',
    ]).then((value) => {
      settled = value;
    });
    expect(double.added).toEqual([output]);
    // chokidar lists every directory before its read lists the entries: not watched yet.
    for (const directory of ['', 'guides', 'guides/guide', 'guides/guide/index']) {
      double.attach(path.join(output, directory));
    }
    await tick(60);
    expect(settled).toBeUndefined();
    double.attach(output, 'routes.ts', 'guides');
    double.attach(path.join(output, 'guides'), 'guide');
    double.attach(path.join(output, 'guides/guide'), 'page.ts', 'index');
    await tick(60);
    expect(settled).toBeUndefined();
    double.attach(path.join(output, 'guides/guide/index'), 'page.ts');
    await watching;
    expect(settled).toBe('watched');
  });

  it('times out after its bound, stops once disposed, and trusts a watcher that cannot list', async () => {
    const output = path.join(await directory(), 'generated');
    const src = path.join(await directory(), 'src');
    await expect(
      watchOutputRoot(watcher().watcher, src, output, ['page.ts'], { timeoutMs: 30 }),
    ).resolves.toBe('timeout');

    let disposed = false;
    const waiting = watchOutputRoot(watcher().watcher, src, output, ['page.ts'], {
      disposed: () => disposed,
    });
    await tick(30);
    disposed = true;
    await expect(waiting).resolves.toBe('disposed');
    // Disposed before it starts: nothing is added.
    const early = watcher();
    await expect(
      watchOutputRoot(early.watcher, src, output, [], { disposed: () => true }),
    ).resolves.toBe('disposed');
    expect(early.added).toEqual([]);
    // Disposed during the grace that follows readiness.
    const ready = watcher();
    ready.attach(output, 'page.ts');
    let late = false;
    const grace = watchOutputRoot(ready.watcher, src, output, ['page.ts'], {
      disposed: () => late,
    });
    await Promise.resolve();
    late = true;
    await expect(grace).resolves.toBe('disposed');

    const blind = watcher({ getWatched: false });
    await expect(watchOutputRoot(blind.watcher, src, output, ['page.ts'])).resolves.toBe('watched');
    expect(blind.added).toEqual([output]);
  });
});

describe('claimed sources without a compiler witness', () => {
  it('settles a created TypeScript source whose generation rewrites no generated module', async () => {
    const root = await directory();
    const notify = vi.fn();
    const coordinator = new HostUpdateCoordinator(notify, vi.fn());
    const stable = manifest(1, [['routes.ts', 'routes']]);
    coordinator.seed(root, stable);
    const category = path.join(root, '../docs/section/ng-doc.category.ts');
    const created = coordinator.begin(category, 'create', async () => '', true);
    // The hook finishes before the generation claims it: the claim holds it.
    const completion = coordinator.complete(created);
    coordinator.started(2, [{ kind: 'create', path: category }]);
    expect(coordinator.blockerCount()).toBe(1);
    coordinator.result(success(2, { ...stable, generation: 2 }));
    coordinator.published(success(2, { ...stable, generation: 2 }), false);
    await completion;
    expect(coordinator.blockerCount()).toBe(0);
    expect(notify).toHaveBeenCalledOnce();
    coordinator.dispose();
  });

  it('holds a deleted source until the compiled update of its generation, whatever the hook order', async () => {
    const root = await directory();
    const notify = vi.fn();
    const coordinator = new HostUpdateCoordinator(notify, vi.fn());
    coordinator.seed(root, manifest(1, [['routes.ts', 'routes-a']]));
    const demo = path.join(root, '../docs/demo.component.ts');
    const deleted = coordinator.begin(demo, 'delete', async () => '', true);
    coordinator.started(2, [{ kind: 'delete', path: demo }]);
    await writeFile(path.join(root, 'routes.ts'), 'routes-b');
    const next = manifest(2, [['routes.ts', 'routes-b']]);
    coordinator.result(success(2, next));
    coordinator.published(success(2, next), false);
    // The deleted source's hook completes only now: the compiled update is still due.
    const sourceCompletion = coordinator.complete(deleted);
    await Promise.resolve();
    await Promise.resolve();
    expect(coordinator.blockerCount()).toBe(2);
    expect(notify).not.toHaveBeenCalled();
    const routes = coordinator.begin(
      path.join(root, 'routes.ts'),
      'update',
      async () => 'routes-b',
      false,
    );
    await routes.ready;
    await coordinator.acknowledge(routes, false, true);
    await Promise.all([coordinator.settle(routes), sourceCompletion]);
    expect(coordinator.blockerCount()).toBe(0);
    expect(notify).toHaveBeenCalledOnce();
    coordinator.dispose();
  });
});
