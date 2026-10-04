import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Project } from 'ts-morph';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Dependency } from '../../contracts';
import { refreshDependencies } from '../../graph';
import {
  bytesDigest,
  canonicalJson,
  canonicalJsonStrict,
  compareCodeUnits,
  contentDigest,
  dependencyIdentity,
  digestOf,
  globIdentity,
  sha256Hex,
} from '../../kernel/canonical';
import { readIdentity } from '../../kernel/footprint';
import {
  CONFLICTING_CONTENT_DIGEST,
  ObservationRecorder,
  readText,
  readTextFile,
} from '../../kernel/observations';
import { TrackedFiles } from '../dependencies';
import { OwnedRoots } from '../owned-roots';
import { trackProgram } from '../program-observations';
import { hostPath, join } from './engine-paths';

const reference = (text: string): string => createHash('sha256').update(text).digest('hex');
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
/** The refresher lists dependencies in its own (canonical JSON) order; compare them as a set. */
const refreshedSet = async (dependencies: Dependency[]): Promise<Dependency[]> =>
  new ObservationRecorder((await refreshDependencies(dependencies, [])).dependencies).all();

describe('canonical digests', () => {
  it('orders strings by code units, never by locale', () => {
    const values = ['b', 'a', 'B', '_x', 'a\0z', 'ab', 'é', 'Z'];
    expect([...values].sort(compareCodeUnits)).toEqual([
      'B',
      'Z',
      '_x',
      'a',
      'a\0z',
      'ab',
      'b',
      'é',
    ]);
    // The locale order differs on exactly these inputs, which is why no digest may use it.
    expect([...values].sort((left, right) => left.localeCompare(right))).not.toEqual(
      [...values].sort(compareCodeUnits),
    );
    expect(compareCodeUnits('a', 'a')).toBe(0);
  });

  it('serializes JSON canonically: code-unit keys, JSON semantics for everything else', () => {
    expect(canonicalJson({ b: 1, a: { z: [3, 2], Z: null }, B: 'x' })).toBe(
      '{"B":"x","a":{"Z":null,"z":[3,2]},"b":1}',
    );
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
    const exotic = {
      skipped: undefined,
      fn: () => 1,
      symbol: Symbol('s'),
      list: [undefined, () => 1, Number.NaN, Infinity, 'ok'],
      date: new Date(0),
      nested: { toJSON: () => ({ y: 1, x: 2 }) },
    };
    expect(canonicalJson(exotic)).toBe(
      '{"date":"1970-01-01T00:00:00.000Z","list":[null,null,null,null,"ok"],"nested":{"x":2,"y":1}}',
    );
    expect(canonicalJson(exotic)).toBe(canonicalJson(JSON.parse(JSON.stringify(exotic))));
    // eslint-disable-next-line no-sparse-arrays
    const sparse = [1, , 2];
    expect(canonicalJson(sparse)).toBe('[1,null,2]');
    expect(canonicalJson(sparse)).toBe(canonicalJson(JSON.parse(JSON.stringify(sparse))));
    expect(canonicalJson(undefined)).toBe('null');
    expect(canonicalJson('a" ')).toBe(JSON.stringify('a" '));
    expect(() => canonicalJson({ big: 1n })).toThrow(TypeError);
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(() => canonicalJson(cycle)).toThrow(TypeError);
    // A repeated, non-cyclic reference is fine.
    const shared = { k: 1 };
    expect(canonicalJson([shared, shared])).toBe('[{"k":1},{"k":1}]');
  });

  it('gives strict identities only to exactly representable values', () => {
    expect(canonicalJsonStrict({ b: [1, 'x', true, null], a: undefined })).toBe(
      '{"a":u,"b":[1,"x",true,null]}',
    );
    expect(canonicalJsonStrict({ Z: 1, a: 2 })).toBe('{"Z":1,"a":2}');
    for (const value of [
      -0,
      Number.NaN,
      Infinity,
      new Array(1),
      new Date(0),
      () => 1,
      Symbol('s'),
      { nested: new Map() },
      [Object.create(null)],
    ])
      expect(canonicalJsonStrict(value)).toBeUndefined();
    const cycle: unknown[] = [];
    cycle.push(cycle);
    expect(canonicalJsonStrict(cycle)).toBeUndefined();
  });

  it('digests values and contents with one sha256', () => {
    expect(digestOf({ b: 1, a: [true, null] })).toBe(reference('{"a":[true,null],"b":1}'));
    expect(sha256Hex('text')).toBe(reference('text'));
    expect(bytesDigest(Buffer.from('text'))).toBe(reference('text'));
    expect(contentDigest('text é')).toBe(bytesDigest(Buffer.from('text é', 'utf8')));
  });

  it('digests a keyword binding over its exports in code-unit order', async () => {
    const lower = { key: 'K', title: 'b', path: 'x' };
    const upper = { key: 'K', title: 'B', path: 'x' };
    for (const keywords of [
      [lower, upper],
      [upper, lower],
    ]) {
      const refreshed = await refreshDependencies(
        [{ kind: 'keyword', key: 'K', digest: 'old' }],
        keywords,
      );
      expect(refreshed.dependencies).toEqual([
        { kind: 'keyword', key: 'K', digest: digestOf([upper, lower]) },
      ]);
    }
  });

  it('names each dependency by one unambiguous identity', () => {
    const glob: Extract<Dependency, { kind: 'glob' }> = {
      kind: 'glob',
      root: '/r',
      include: ['a,b'],
      exclude: [],
      members: [],
    };
    const split = { ...glob, include: ['a', 'b'] };
    const identities = [
      { kind: 'content', path: '/r/a', digest: 'x' },
      { kind: 'existence', path: '/r/a', exists: true },
      glob,
      split,
      { kind: 'keyword', key: 'K', digest: 'x' },
      { kind: 'semantic', scopeId: 's', digest: 'x', files: [] },
      { kind: 'semantic-reference', scopeId: 's', digest: 'x' },
      { kind: 'semantic-closure', scopeId: 's', key: 'api:x', digest: 'x' },
      { kind: 'evaluated', entryId: 'e', digest: 'x' },
    ].map((dependency) => dependencyIdentity(dependency as Dependency));
    expect(identities).toEqual([
      'content:/r/a',
      'existence:/r/a',
      'glob:/r:["a,b"]:[]',
      'glob:/r:["a","b"]:[]',
      'keyword:K',
      'semantic:s',
      'semantic-reference:s',
      'semantic-closure:s:api:x',
      'evaluated:e',
    ]);
    expect(readIdentity(glob)).toBe(globIdentity(glob));
  });
});

describe('the observation recorder', () => {
  let root: string;
  const at = (name: string): string => join(root, name);
  const write = (name: string, bytes: string | Buffer): string => {
    fs.writeFileSync(at(name), bytes);
    return at(name);
  };

  beforeEach(() => {
    root = hostPath(fs.realpathSync(fs.mkdtempSync(join(os.tmpdir(), 'ng-doc-canonical-'))));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('lists dependencies in code-unit order of their identities', () => {
    const recorder = new ObservationRecorder();
    for (const name of ['b.ts', 'B.ts', 'a.ts', '_.ts']) recorder.observeFile(write(name, name));
    expect(
      recorder
        .all()
        .map(
          (dependency) =>
            `${dependency.kind}:${'path' in dependency ? path.basename(dependency.path) : ''}`,
        ),
    ).toEqual([
      'content:B.ts',
      'content:_.ts',
      'content:a.ts',
      'content:b.ts',
      'existence:B.ts',
      'existence:_.ts',
      'existence:a.ts',
      'existence:b.ts',
    ]);
    // A published (ordered) list is taken over as it is; an unordered one is sorted.
    const ordered = recorder.all();
    expect(new ObservationRecorder(ordered).all()).toEqual(ordered);
    expect(new ObservationRecorder([...ordered].reverse()).all()).toEqual(ordered);
  });

  it('reads each file once with a byte cache, and shares it with a child', () => {
    const file = write('page.md', 'one');
    const parent = new ObservationRecorder([], {
      cacheBytes: true,
      normalize: (value) => `n:${value}`,
    });
    const child = new ObservationRecorder([], { parent });
    expect(child.readText(file)).toBe('one');
    fs.writeFileSync(file, 'two');
    expect(parent.readText(file)).toBe('one');
    expect(child.all()).toEqual(parent.all());
    expect(parent.all()).toEqual([
      { kind: 'content', path: `n:${file}`, digest: reference('one') },
      { kind: 'existence', path: `n:${file}`, exists: true },
    ]);
    expect(parent.readFile(at('missing'))).toBeUndefined();
    expect(() => parent.readText(at('missing'))).toThrow(/ENOENT/);
    expect(parent.all()).toContainEqual({
      kind: 'existence',
      path: `n:${at('missing')}`,
      exists: false,
    });
  });

  it('records a conflicting digest when a recorder without a byte cache sees two contents', () => {
    const file = write('data.json', '1');
    const seen: Dependency[] = [];
    const recorder = new ObservationRecorder([], {
      observer: (dependency) => seen.push(dependency),
    });
    recorder.readFile(file);
    recorder.readFile(file);
    expect(recorder.all()).toHaveLength(2);
    fs.writeFileSync(file, '2');
    recorder.readFile(file);
    recorder.add({ kind: 'content', path: file, digest: reference('1') });
    expect(recorder.all()).toContainEqual({
      kind: 'content',
      path: file,
      digest: CONFLICTING_CONTENT_DIGEST,
    });
    expect(seen).toHaveLength(7);
  });

  it('digests every reader of a file in one domain, which the refresher confirms', async () => {
    const files = {
      plain: write('plain.ts', 'export const a = "é";\n'),
      bom: write('bom.ts', Buffer.concat([BOM, Buffer.from('export const b = 1;\n')])),
      invalid: write('invalid.ts', Buffer.from([0x78, 0xff, 0xfe, 0x0a])),
    };
    for (const file of Object.values(files)) {
      const bytes = fs.readFileSync(file);
      const discovery = new ObservationRecorder([], { cacheBytes: true });
      discovery.readFile(file);
      const semantic = new TrackedFiles();
      semantic.read(file);
      const digests = new Set([
        bytesDigest(bytes),
        readText(file).digest,
        (await readTextFile(file)).digest,
        ...[...discovery.all(), ...semantic.all()].flatMap((dependency) =>
          dependency.kind === 'content' ? [dependency.digest] : [],
        ),
      ]);
      expect(digests.size).toBe(1);
      expect(await refreshedSet(semantic.all())).toEqual(semantic.all());
    }
    // Decoding kept every byte of the plain file, so its text digests the same.
    expect(contentDigest(readText(files.plain).text)).toBe(readText(files.plain).digest);
    // Replacement characters would hide which invalid bytes were read.
    expect(contentDigest(readText(files.invalid).text)).not.toBe(readText(files.invalid).digest);
  });

  it('digests a program file read with a byte order mark from its raw read', async () => {
    const plain = write('plain.ts', 'export const a = 1;\n');
    const bom = write('bom.ts', Buffer.concat([BOM, Buffer.from('export const b = 1;\n')]));
    const owned = new OwnedRoots([at('output')]);
    const project = new Project({
      compilerOptions: { noLib: true, types: [] },
      fileSystem: owned.fileSystem(),
      skipAddingFilesFromTsConfig: true,
    });
    for (const file of [plain, bom]) project.addSourceFileAtPath(file);
    expect(project.getSourceFileOrThrow(bom).getFullText().charCodeAt(0)).not.toBe(0xfeff);
    const files = new TrackedFiles();
    trackProgram(project, files, owned);
    const content = (file: string) =>
      files.all().find((dependency) => dependency.kind === 'content' && dependency.path === file);
    for (const file of [plain, bom])
      expect(content(file)).toEqual({
        kind: 'content',
        path: file,
        digest: bytesDigest(fs.readFileSync(file)),
      });
    expect(await refreshedSet(files.all())).toEqual(files.all());
    // The raw read only stands for the text it produced.
    expect(owned.contentDigest(bom, 'export const other = 2;\n')).toBe(
      contentDigest('export const other = 2;\n'),
    );
    owned.recordRead(bom, 'export const b = 1;\n');
    expect(owned.contentDigest(bom, 'export const b = 1;\n')).toBe(
      contentDigest('export const b = 1;\n'),
    );
  });
});
