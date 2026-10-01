import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';

import type { Dependency } from '../../contracts';
import {
  changedObservation,
  CONFLICTING_CONTENT_DIGEST,
  DirectoryListings,
  observationClockNs,
  ObservationStamps,
  stampSettledBefore,
} from '../index';

// Stat-validated observations of a retained program and the path check of a watcher change set
// against observations.

let root: string;
beforeEach(() => {
  root = realpathSync(mkdtempSync(path.join(tmpdir(), 'ngdoc-stamps-')));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const digestOf = (file: string) => sha(readFileSync(file, 'utf8'));
const write = (file: string, content: string) => {
  const target = path.join(root, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
  return target;
};
const content = (file: string): Dependency => ({
  kind: 'content',
  path: file,
  digest: digestOf(file),
});
/** An observation that began one second from now: everything written so far is settled. */
const later = () => observationClockNs() + 1_000_000_000n;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test('a settled, unchanged content observation verifies by stat alone', () => {
  const file = write('a.ts', 'export const a = 1;');
  const observed = [
    content(file),
    { kind: 'existence', path: path.join(root, 'b.ts'), exists: false } as Dependency,
  ];
  const stamps = new ObservationStamps(digestOf);
  stamps.record(observed, later());
  expect(stamps.counts).toEqual({ stamped: 1, unverifiable: 0 });
  expect(stamps.sweep(observed)).toEqual({ stamped: 1, rehashed: 0, probed: 1 });
});

test('changed bytes, a missing file, an unreadable digest and an existence change are reported', () => {
  const file = write('a.ts', 'export const a = 1;');
  const observed = [content(file)];
  const stamps = new ObservationStamps(digestOf);
  stamps.record(observed, later());
  write('a.ts', 'export const a = 2;');
  expect(stamps.sweep(observed).changed).toEqual({ path: file, kind: 'content' });
  // The stamp is dropped: the changed file stays changed on the next sweep.
  expect(stamps.sweep(observed)).toMatchObject({ changed: { path: file }, rehashed: 1 });
  unlinkSync(file);
  expect(stamps.sweep(observed).changed).toEqual({ path: file, kind: 'content' });
  write('a.ts', 'export const a = 1;');
  const throwing = new ObservationStamps(() => {
    throw new Error('unreadable');
  });
  expect(throwing.sweep(observed).changed).toEqual({ path: file, kind: 'content' });
  const created = path.join(root, 'created.ts');
  const existence: Dependency[] = [{ kind: 'existence', path: created, exists: false }];
  write('created.ts', '');
  expect(stamps.sweep(existence)).toEqual({
    changed: { path: created, kind: 'existence' },
    stamped: 0,
    rehashed: 0,
    probed: 1,
  });
});

test('a touched file with the same bytes is re-hashed, then trusted again once settled', async () => {
  const file = write('a.ts', 'export const a = 1;');
  const observed = [content(file)];
  const stamps = new ObservationStamps(digestOf);
  stamps.record(observed, later());
  const past = new Date(Date.now() - 60_000);
  utimesSync(file, past, past);
  // ctime is now: the stat differs, the bytes are equal, the new stamp is not settled yet.
  expect(stamps.sweep(observed)).toEqual({ stamped: 0, rehashed: 1, probed: 0 });
  expect(stamps.counts.stamped).toBe(0);
  await pause(120);
  expect(stamps.sweep(observed)).toEqual({ stamped: 0, rehashed: 1, probed: 0 });
  expect(stamps.counts.stamped).toBe(1);
  expect(stamps.sweep(observed)).toEqual({ stamped: 1, rehashed: 0, probed: 0 });
});

test('a file written during the observation, or read with conflicting bytes, never verifies', () => {
  const file = write('a.ts', 'export const a = 1;');
  const other = write('b.ts', 'export const b = 1;');
  const written = statSync(file, { bigint: true });
  // The observation began just before the write (an A→B→A write during it is indistinguishable).
  const stamps = new ObservationStamps(digestOf);
  stamps.record([content(file)], written.mtimeNs - 1_000_000n);
  expect(stamps.counts).toEqual({ stamped: 0, unverifiable: 1 });
  expect(stamps.sweep([content(file)]).changed).toEqual({ path: file, kind: 'content' });
  // Conflicting reads of one path in the observing generation.
  const conflicting: Dependency = {
    kind: 'content',
    path: other,
    digest: CONFLICTING_CONTENT_DIGEST,
  };
  stamps.record([conflicting], later());
  expect(stamps.sweep([conflicting]).changed).toEqual({ path: other, kind: 'content' });
  // A later settled observation of the same path is trusted again.
  stamps.record([content(file)], later());
  expect(stamps.sweep([content(file)]).changed).toBeUndefined();
  // A recorded content observation whose file is already gone is unverifiable.
  const gone = write('gone.ts', 'x');
  const goneObservation = content(gone);
  unlinkSync(gone);
  stamps.record([goneObservation], later());
  expect(stamps.sweep([goneObservation]).changed).toEqual({ path: gone, kind: 'content' });
});

test('whole-second timestamps need a two-second margin; fine timestamps fifty milliseconds', () => {
  const stamp = (mtimeNs: bigint, ctimeNs = mtimeNs) => ({
    dev: 1n,
    ino: 1n,
    size: 1n,
    mtimeNs,
    ctimeNs,
  });
  const since = 100_000_000_000n;
  expect(stampSettledBefore(stamp(since - 60_000_000n + 1n), since)).toBe(true);
  expect(stampSettledBefore(stamp(since - 40_000_000n + 1n), since)).toBe(false);
  expect(stampSettledBefore(stamp(since - 1_000_000_000n), since)).toBe(false);
  expect(stampSettledBefore(stamp(since - 3_000_000_000n), since)).toBe(true);
  expect(stampSettledBefore(stamp(since - 3_000_000_000n, since), since)).toBe(false);
});

test('changedObservation decides a change set by observed paths and glob membership', () => {
  const tracked = write('src/a.ts', 'export const a = 1;');
  const probe = path.join(root, 'src/missing.ts');
  const member = write('src/api/member.ts', '');
  const glob: Dependency = {
    kind: 'glob',
    root: path.join(root, 'src'),
    include: ['api/*.ts'],
    exclude: [],
    members: [member],
  };
  const observed: Dependency[] = [
    content(tracked),
    { kind: 'existence', path: probe, exists: false },
    glob,
  ];
  expect(changedObservation(observed, [])).toBeUndefined();
  expect(changedObservation(observed, [{ kind: 'update', path: tracked }])).toContain(
    'observed input',
  );
  expect(
    changedObservation(observed, [{ kind: 'create', path: write('src/missing.ts', '') }]),
  ).toContain('observed input');
  unlinkSync(probe);
  // A change reported under a symlinked path resolves to the observed real path.
  symlinkSync(path.join(root, 'src'), path.join(root, 'linked'), 'dir');
  expect(
    changedObservation(observed, [{ kind: 'update', path: path.join(root, 'linked/a.ts') }]),
  ).toContain(tracked);
  // Unobserved updates and files outside every glob.
  expect(
    changedObservation(observed, [{ kind: 'update', path: write('docs/index.md', '#') }]),
  ).toBeUndefined();
  expect(
    changedObservation(observed, [{ kind: 'create', path: write('other/new.ts', '') }]),
  ).toBeUndefined();
  // Membership: a new matching file, a deleted member, a moved-in update.
  expect(
    changedObservation(observed, [{ kind: 'create', path: write('src/api/new.ts', '') }]),
  ).toContain('membership');
  expect(
    changedObservation(observed, [{ kind: 'update', path: path.join(root, 'src/api/new.ts') }]),
  ).toContain('membership');
  unlinkSync(member);
  expect(changedObservation(observed, [{ kind: 'delete', path: member }])).toContain('membership');
  // A regular non-matching file created under the root is not a membership change.
  expect(
    changedObservation(observed, [{ kind: 'create', path: write('src/notes.md', '') }]),
  ).toBeUndefined();
  // A created directory under a glob root may stand for files that were not reported.
  mkdirSync(path.join(root, 'src/api/nested'));
  expect(
    changedObservation(observed, [{ kind: 'create', path: path.join(root, 'src/api/nested') }]),
  ).toContain('create of directory');
  // A delete of a directory that held members removes them.
  const held = write('src/api/deep/held.ts', '');
  const deep: Dependency = { ...glob, include: ['api/**/*.ts'], members: [held] };
  rmSync(path.join(root, 'src/api/deep'), { recursive: true });
  expect(
    changedObservation([deep], [{ kind: 'delete', path: path.join(root, 'src/api/deep') }]),
  ).toContain('removes members');
  // Atomic-save noise cannot change membership: a delete of a path that held no member, and a
  // create of a temporary file that is already gone again.
  expect(
    changedObservation(observed, [{ kind: 'delete', path: path.join(root, 'src/gone.md') }]),
  ).toBeUndefined();
  expect(
    changedObservation(observed, [
      { kind: 'create', path: path.join(root, 'src/api/new.ts___jb_tmp___') },
    ]),
  ).toBeUndefined();
  expect(
    changedObservation(observed, [{ kind: 'delete', path: path.join(root, 'elsewhere/gone.md') }]),
  ).toBeUndefined();
});

test('DirectoryListings: stat fast path, re-listing, type roots and glob directories', async () => {
  // A type root: every entry counts.
  write('types/a/index.d.ts', '');
  const listings = new DirectoryListings();
  listings.record(path.join(root, 'types'), later());
  listings.record(path.join(root, 'absent'), later());
  expect(listings.sweep()).toEqual({ stamped: 1, relisted: 1 });
  write('types/b/index.d.ts', '');
  expect(listings.sweep().changed).toBe(path.join(root, 'types'));
  const absent = new DirectoryListings();
  absent.record(path.join(root, 'absent'), later());
  mkdirSync(path.join(root, 'absent'));
  expect(absent.sweep().changed).toBe(path.join(root, 'absent'));
  // A type root written during the observation never verifies.
  const racy = new DirectoryListings();
  racy.record(path.join(root, 'types'), observationClockNs() - 1_000_000_000n);
  expect(racy.sweep().changed).toBe(path.join(root, 'types'));

  // Glob directories: the root and every directory on the way to a member.
  const member = write('lib/api/deep/member.ts', '');
  const glob: Extract<Dependency, { kind: 'glob' }> = {
    kind: 'glob',
    root: path.join(root, 'lib'),
    include: ['**/*.ts'],
    exclude: [],
    members: [member],
  };
  const globs = new DirectoryListings();
  globs.recordGlob(glob, later());
  expect(globs.size).toBe(3);
  expect(globs.sweep()).toEqual({ stamped: 3, relisted: 0 });
  // A non-matching file (an atomic save's temporary or a markdown file) keeps the listing.
  write('lib/api/notes.md', '');
  await pause(120);
  expect(globs.sweep()).toEqual({ stamped: 2, relisted: 1 });
  expect(globs.sweep()).toEqual({ stamped: 3, relisted: 0 });
  // A matching file created without any event, or a new subdirectory, changes it.
  write('lib/api/late.ts', '');
  expect(globs.sweep().changed).toBe(path.join(root, 'lib/api'));
  unlinkSync(path.join(root, 'lib/api/late.ts'));
  mkdirSync(path.join(root, 'lib/api/other'));
  expect(globs.sweep().changed).toBe(path.join(root, 'lib/api'));
  // Recorded members that no longer match the directory (changed while observed): unverifiable.
  const stale = new DirectoryListings();
  stale.recordGlob(
    { ...glob, members: [member, path.join(root, 'lib/api/deep/gone.ts')] },
    later(),
  );
  expect(stale.sweep().changed).toBe(path.join(root, 'lib/api/deep'));
  // Only subdirectories that can hold a match count: not a directory the patterns cannot reach,
  // an excluded one, or an ignored (generator-owned) one.
  write('site/docs/api.ts', '');
  const scoped: Extract<Dependency, { kind: 'glob' }> = {
    kind: 'glob',
    root: path.join(root, 'site'),
    include: ['docs/api*.ts'],
    exclude: ['**/node_modules/**'],
    members: [path.join(root, 'site/docs/api.ts')],
  };
  const narrow = new DirectoryListings();
  narrow.recordGlob(scoped, later(), (directory) => directory.endsWith('/site/out'));
  for (const directory of ['site/cache', 'site/out', 'site/docs/node_modules', 'site/docs/sub'])
    mkdirSync(path.join(root, directory), { recursive: true });
  expect(narrow.sweep().changed).toBeUndefined();
  mkdirSync(path.join(root, 'site/other/deep'), { recursive: true });
  expect(narrow.sweep().changed).toBeUndefined();
  const wide = new DirectoryListings();
  wide.recordGlob({ ...scoped, include: ['**/*.ts'] }, later(), () => false);
  mkdirSync(path.join(root, 'site/docs/nested'));
  expect(wide.sweep().changed).toBe(path.join(root, 'site/docs'));
  // A symlinked subdirectory counts as a directory.
  symlinkSync(path.join(root, 'lib/api/deep'), path.join(root, 'lib/linked'), 'dir');
  const linked = new DirectoryListings();
  linked.recordGlob(glob, later());
  expect(linked.sweep().changed).toBeUndefined();
});

test('changedObservation matches globs across symlinked roots and reported paths (for example /var and /private/var)', () => {
  const real = path.join(root, 'real');
  write('real/api/member.ts', '');
  symlinkSync(real, path.join(root, 'alias'), 'dir');
  // Recorded under the alias, reported under the real path, and the reverse.
  const aliased: Dependency = {
    kind: 'glob',
    root: path.join(root, 'alias'),
    include: ['api/*.ts'],
    exclude: [],
    members: [path.join(root, 'alias/api/member.ts')],
  };
  expect(
    changedObservation([aliased], [{ kind: 'create', path: write('real/api/added.ts', '') }]),
  ).toContain('membership');
  const recordedReal: Dependency = {
    ...aliased,
    root: real,
    members: [path.join(real, 'api/member.ts')],
  };
  expect(
    changedObservation(
      [recordedReal],
      [{ kind: 'create', path: path.join(root, 'alias/api/added.ts') }],
    ),
  ).toContain('membership');
  // A deleted member reported under the other spelling is resolved through its existing ancestor.
  unlinkSync(path.join(real, 'api/member.ts'));
  expect(
    changedObservation(
      [recordedReal],
      [{ kind: 'delete', path: path.join(root, 'alias/api/member.ts') }],
    ),
  ).toContain('membership');
  // Nothing exists on the path at all: only the reported spelling is compared.
  expect(
    changedObservation(
      [recordedReal],
      [{ kind: 'delete', path: '/nonexistent-ngdoc-root/x/y.ts' }],
    ),
  ).toBeUndefined();
});
