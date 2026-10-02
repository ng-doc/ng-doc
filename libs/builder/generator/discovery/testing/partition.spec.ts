/** @vitest-environment node */

import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';

import type {
  Dependency,
  DiscoveryRequest,
  DiscoverySnapshot,
  EntryDescriptor,
  TemplateActions,
} from '../../contracts';
import { refreshDependencies } from '../../graph';
import { bytesDigest, compareCodeUnits, dependencyIdentity } from '../../kernel/canonical';
import { forwardSlashes, hostPath } from '../../kernel/paths';
import { DiscoveryServiceImpl, evaluatedDigests } from '..';

/**
 * `path.join` in the engine's spelling (forward slashes, drive letter kept), which every path the
 * service records uses, so expected paths equal recorded ones on Windows too.
 * @param parts The path segments.
 */
function join(...parts: string[]): string {
  return forwardSlashes(path.join(...parts));
}

// The discovery input partition: the configuration digest covers only the configuration's own
// inputs, each entry records its own evaluation closure (with the resolution probes of its
// modules) and an `evaluated` digest of its live value, which is never a path.

const roots: string[] = [];
const services: DiscoveryServiceImpl[] = [];
afterEach(async () => {
  for (const service of services.splice(0)) await service.dispose();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

interface Tree {
  root: string;
  write(file: string, text: string): void;
  discover(generation?: number): Promise<DiscoverySnapshot>;
  service: DiscoveryServiceImpl;
}

/**
 *
 * @param files
 */
function tree(files: Record<string, string>): Tree {
  const root = hostPath(realpathSync(mkdtempSync(path.join(tmpdir(), 'ngdoc-partition-'))));
  roots.push(root);
  const write = (file: string, text: string) => {
    const target = join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, text);
  };
  write('tsconfig.json', JSON.stringify({ compilerOptions: { target: 'ES2022' } }));
  for (const [file, text] of Object.entries(files)) write(file, text);
  const service = new DiscoveryServiceImpl();
  services.push(service);
  const request: DiscoveryRequest = {
    generation: 1,
    changes: [],
    projectId: 'partition',
    workspaceRoot: root,
    configFile: join(root, 'ng-doc.config.ts'),
    defaults: {
      docsRoot: join(root, 'docs'),
      tsConfig: join(root, 'tsconfig.json'),
      outputRoot: join(root, 'out'),
      cacheRoot: join(root, 'cache'),
    },
  };
  return {
    root,
    write,
    service,
    async discover(generation: number = 1) {
      const result = await service.discover(
        { ...request, generation },
        new AbortController().signal,
      );
      expect(result.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
      return result.value!;
    },
  };
}

const byTitle = (snapshot: DiscoverySnapshot, title: string): EntryDescriptor =>
  snapshot.entries.find((entry) => entry.title === title)!;
const paths = (entry: EntryDescriptor, kind: Dependency['kind']): string[] =>
  entry.dependencies.flatMap((item) => (item.kind === kind && 'path' in item ? [item.path] : []));
const evaluatedOf = (entry: EntryDescriptor) =>
  entry.dependencies.filter((item) => item.kind === 'evaluated');

const pageFiles = (): Record<string, string> => ({
  'config-value.ts': `export const prefix = 'site';`,
  'ng-doc.config.ts': `import { prefix } from './config-value'; export default { docsPath: 'docs', routePrefix: prefix };`,
  'docs/a/helper.ts': `export const suffix = ' A';`,
  'docs/a/ng-doc.page.ts': `import { suffix } from './helper'; const Page = { title: 'Alpha', mdFile: './index.md', data: { label: 'a' + suffix } }; export default Page;`,
  'docs/a/index.md': '# Alpha',
  'docs/b/ng-doc.page.ts': `import { shared } from '../shared'; const Page = { title: 'Beta', mdFile: './index.md', data: shared }; export default Page;`,
  'docs/b/index.md': '# Beta',
  'docs/shared.ts': `export const shared = { value: 1 };`,
  'docs/cat/ng-doc.category.ts': `const Cat = { title: 'Cat' }; export default Cat;`,
  'docs/cat/c/ng-doc.page.ts': `import Cat from '../ng-doc.category'; const Page = { title: 'Gamma', category: Cat, mdFile: './index.md' }; export default Page;`,
  'docs/cat/c/index.md': '# Gamma',
});

test('each entry records its own closure, the probes of its modules and one evaluated digest', async () => {
  const t = tree(pageFiles());
  const found = await t.discover();
  const alpha = byTitle(found, 'Alpha');
  const beta = byTitle(found, 'Beta');
  const gamma = byTitle(found, 'Gamma');
  const file = (name: string) => join(t.root, name);

  expect(paths(alpha, 'content')).toEqual(
    expect.arrayContaining([file('docs/a/ng-doc.page.ts'), file('docs/a/helper.ts')]),
  );
  expect(paths(alpha, 'content')).not.toContain(file('docs/shared.ts'));
  expect(paths(alpha, 'content')).not.toContain(file('config-value.ts'));
  expect(paths(alpha, 'content')).not.toContain(file('docs/b/ng-doc.page.ts'));
  expect(paths(beta, 'content')).toEqual(
    expect.arrayContaining([file('docs/b/ng-doc.page.ts'), file('docs/shared.ts')]),
  );
  expect(paths(beta, 'content')).not.toContain(file('docs/a/helper.ts'));
  // A page reaches its category's module (and its closure) through the import.
  expect(paths(gamma, 'content')).toContain(file('docs/cat/ng-doc.category.ts'));
  // Resolution probes belong to the importing module's entries.
  expect(paths(alpha, 'existence')).toContain(file('docs/a/helper.tsx'));
  expect(paths(beta, 'existence')).not.toContain(file('docs/a/helper.tsx'));
  expect(paths(beta, 'existence')).toContain(file('docs/shared.tsx'));
  for (const entry of found.entries) {
    expect(evaluatedOf(entry)).toEqual([
      { kind: 'evaluated', entryId: entry.id, digest: expect.stringMatching(/^[a-f0-9]{64}$/) },
    ]);
  }
  expect(evaluatedDigests(found.entries)).toEqual(
    new Map(found.entries.map((entry) => [entry.id, evaluatedOf(entry)[0]!.digest])),
  );
});

test('an entry edit changes only that entry; a configuration input changes the configuration digest', async () => {
  const t = tree(pageFiles());
  const first = await t.discover();
  t.write(
    'docs/a/ng-doc.page.ts',
    `import { suffix } from './helper'; const Page = { title: 'Alpha Renamed', mdFile: './index.md', data: { label: 'a' + suffix } }; export default Page;`,
  );
  t.write('docs/a/helper.ts', `export const suffix = ' A2';`);
  const second = await t.discover(2);
  expect(second.configuration).toEqual(first.configuration);
  expect(byTitle(second, 'Beta')).toEqual(byTitle(first, 'Beta'));
  expect(byTitle(second, 'Gamma')).toEqual(byTitle(first, 'Gamma'));
  const before = byTitle(first, 'Alpha');
  const after = byTitle(second, 'Alpha Renamed');
  expect(evaluatedOf(after)).not.toEqual(evaluatedOf(before));
  expect(after.dependencies).not.toEqual(before.dependencies);

  t.write('config-value.ts', `export const prefix = 'site';  `);
  const third = await t.discover(3);
  expect(third.configuration.digest).not.toBe(second.configuration.digest);
  expect(third.configuration.executables).toEqual(second.configuration.executables);
  expect(byTitle(third, 'Beta')).toEqual(byTitle(second, 'Beta'));
});

test('an entry added or removed leaves the configuration digest; the description scan is a discovery input', async () => {
  const t = tree(pageFiles());
  const first = await t.discover();
  t.write('docs/d/index.md', '# Delta');
  t.write(
    'docs/d/ng-doc.page.ts',
    `const Page = { title: 'Delta', mdFile: './index.md' }; export default Page;`,
  );
  const added = await t.service.discover(
    {
      generation: 2,
      changes: [],
      projectId: 'partition',
      workspaceRoot: t.root,
      configFile: join(t.root, 'ng-doc.config.ts'),
      defaults: {
        docsRoot: join(t.root, 'docs'),
        tsConfig: join(t.root, 'tsconfig.json'),
        outputRoot: join(t.root, 'out'),
        cacheRoot: join(t.root, 'cache'),
      },
    },
    new AbortController().signal,
  );
  const second = added.value!;
  // Every other artifact keeps its fingerprint: the targeted path diffs the entry set instead.
  expect(second.configuration).toEqual(first.configuration);
  expect(byTitle(second, 'Alpha')).toEqual(byTitle(first, 'Alpha'));
  expect(byTitle(second, 'Delta')).toBeDefined();
  // The scan's membership is still observed (a new description module starts a generation).
  const scan = added.dependencies.find(
    (item) => item.kind === 'glob' && item.root === join(t.root, 'docs'),
  );
  expect(scan && scan.kind === 'glob' ? scan.members : []).toContain(
    join(t.root, 'docs/d/ng-doc.page.ts'),
  );
  rmSync(join(t.root, 'docs/d'), { recursive: true });
  const third = await t.discover(3);
  expect(third.configuration).toEqual(first.configuration);
  expect(third.entries).toEqual(first.entries);
});

test('a module that mutates shared state changes the evaluated digest of the entry that reads it', async () => {
  const files = pageFiles();
  files['docs/d/ng-doc.page.ts'] =
    `import { shared } from '../shared'; shared.value = 2; const Page = { title: 'Delta', mdFile: './index.md' }; export default Page;`;
  files['docs/d/index.md'] = '# Delta';
  const t = tree(files);
  const first = await t.discover();
  t.write(
    'docs/d/ng-doc.page.ts',
    `import { shared } from '../shared'; shared.value = 3; const Page = { title: 'Delta', mdFile: './index.md' }; export default Page;`,
  );
  const second = await t.discover(2);
  const before = byTitle(first, 'Beta');
  const after = byTitle(second, 'Beta');
  // Beta's own closure did not change; only its evaluated value did.
  expect(after.dependencies.filter((item) => item.kind !== 'evaluated')).toEqual(
    before.dependencies.filter((item) => item.kind !== 'evaluated'),
  );
  expect(evaluatedOf(after)[0]!.digest).not.toBe(evaluatedOf(before)[0]!.digest);
  expect(byTitle(second, 'Alpha')).toEqual(byTitle(first, 'Alpha'));
});

test('values that hold a function or cannot be canonicalized are keyed by the whole bundle', async () => {
  const attested: Record<string, string> = {
    date: `{ at: new Date(0) }`,
    regexp: `{ pattern: /a+b/gi }`,
    numbers: `{ nan: NaN, inf: -Infinity, none: undefined, big: BigInt(7) }`,
    shared: `(() => { const item = { x: 1 }; return { first: item, second: item, list: [item] }; })()`,
    hidden: `Object.defineProperty({}, 'hidden', { value: 1, enumerable: false })`,
    empty: `Object.assign(Object.create(null), { bare: true })`,
    symbolKey: `{ [Symbol('skipped')]: 1, kept: 2 }`,
    sparse: `[1, , 3]`,
  };
  // A function's result can depend on state it closes over, which any module may mutate.
  const withFunctions: Record<string, string> = {
    fn: `{ greet(name: string) { return 'hi ' + name; } }`,
    klass: `{ Kind: class Kind { value = 1; } }`,
    fnProps: `(() => { function f() { return 1; } (f as any).extra = { x: 1 }; return { f }; })()`,
    staticMembers: `{ Kind: class Kind { static label = 'k'; static make() { return 1; } } }`,
  };
  const unattested: Record<string, string> = {
    symbol: `{ tag: Symbol('tag') }`,
    proxy: `{ proxied: new Proxy({}, {}) }`,
    bound: `{ call: function named() { return 1; }.bind(null) }`,
    instance: `{ map: new Map([[1, 2]]) }`,
    accessor: `{ get computed() { return 1; } }`,
    fnAccessor: `(() => { function f() {} Object.defineProperty(f, 'lazy', { get: () => 1 }); return { f }; })()`,
  };
  const files: Record<string, string> = {
    'ng-doc.config.ts': `export default { docsPath: 'docs' };`,
    'docs/other/ng-doc.page.ts': `const Page = { title: 'Other', mdFile: './index.md' }; export default Page;`,
    'docs/other/index.md': '# Other',
  };
  for (const [name, data] of Object.entries({ ...attested, ...withFunctions, ...unattested })) {
    files[`docs/${name}/ng-doc.page.ts`] =
      `const Page = { title: '${name}', mdFile: './index.md', data: ${data} }; export default Page;`;
    files[`docs/${name}/index.md`] = `# ${name}`;
  }
  const t = tree(files);
  const first = await t.discover();
  const again = await t.discover(2);
  const digest = (snapshot: DiscoverySnapshot, title: string) =>
    evaluatedOf(byTitle(snapshot, title))[0]!.digest;
  for (const name of Object.keys({ ...attested, ...withFunctions, ...unattested }))
    expect({ name, digest: digest(again, name) }).toEqual({ name, digest: digest(first, name) });
  // Any change of the evaluated code (here an unrelated page) changes every bundle-keyed digest.
  t.write(
    'docs/other/ng-doc.page.ts',
    `const Page = { title: 'Other', mdFile: './index.md', order: 1 }; export default Page;`,
  );
  const changed = await t.discover(3);
  for (const name of Object.keys(attested))
    expect({ name, same: digest(changed, name) === digest(first, name) }).toEqual({
      name,
      same: true,
    });
  for (const name of Object.keys({ ...withFunctions, ...unattested }))
    expect({ name, same: digest(changed, name) === digest(first, name) }).toEqual({
      name,
      same: false,
    });
  // A function is digested by its source text.
  t.write(
    'docs/fn/ng-doc.page.ts',
    `const Page = { title: 'fn', mdFile: './index.md', data: { greet(name: string) { return 'hello ' + name; } } }; export default Page;`,
  );
  expect(digest(await t.discover(4), 'fn')).not.toBe(digest(changed, 'fn'));
});

test('guide values and template renders record the entry evaluated dependency', async () => {
  const t = tree({
    ...pageFiles(),
    'docs/a/ng-doc.page.ts': `const Page = { title: 'Alpha', mdFile: './index.md', playgrounds: { Box: { target: class {}, controls: { label: { type: 'string' } } } } }; export default Page;`,
  });
  const found = await t.discover();
  const alpha = byTitle(found, 'Alpha');
  const evaluated = evaluatedOf(alpha)[0]!;
  expect(t.service.readGuideValues(alpha.id).dependencies).toContainEqual(evaluated);
  const actions: TemplateActions = { invoke: () => '' };
  const rendered = t.service.render(
    {
      entryId: alpha.id,
      source: { path: join(t.root, 'docs/a/index.md') },
      text: '{{ NgDocPage.title }}',
      scope: join(t.root, 'docs/a'),
      kind: 'guide',
      values: {},
    },
    actions,
  );
  expect(rendered.value).toBe('Alpha');
  expect(rendered.dependencies).toContainEqual(evaluated);
  // A playground control change changes the digest (the guide values are part of it).
  t.write(
    'docs/a/ng-doc.page.ts',
    `const Page = { title: 'Alpha', mdFile: './index.md', playgrounds: { Box: { target: class {}, controls: { label: { type: 'number' } } } } }; export default Page;`,
  );
  const next = byTitle(await t.discover(2), 'Alpha');
  expect(evaluatedOf(next)[0]!.digest).not.toBe(evaluated.digest);
});

test('entry dependencies are in code-unit order and in the one content digest domain', async () => {
  const t = tree({
    'ng-doc.config.ts': `export default { docsPath: 'docs' };`,
    'docs/p/Zeta.ts': `export const zeta = 'Z';`,
    'docs/p/alpha.ts': `export const alpha = 'a';`,
    // A byte order mark and a non-ASCII character: every reader digests the same bytes.
    'docs/p/ng-doc.page.ts': `\uFEFFimport { zeta } from './Zeta'; import { alpha } from './alpha'; const Page = { title: 'Order é', mdFile: './index.md', data: zeta + alpha }; export default Page;`,
    'docs/p/index.md': '# Order',
  });
  const found = await t.discover();
  const entry = byTitle(found, 'Order é');
  const identities = entry.dependencies.map(dependencyIdentity);
  expect(identities).toEqual([...identities].sort(compareCodeUnits));
  const content = paths(entry, 'content');
  // Code-unit order puts `Zeta.ts` before `alpha.ts`; a locale order would not.
  expect(content.indexOf(join(t.root, 'docs/p/Zeta.ts'))).toBeLessThan(
    content.indexOf(join(t.root, 'docs/p/alpha.ts')),
  );
  for (const dependency of entry.dependencies)
    if (dependency.kind === 'content')
      expect(dependency.digest).toBe(bytesDigest(readFileSync(dependency.path)));
  const refreshed = await refreshDependencies(
    entry.dependencies.filter((item) => item.kind !== 'evaluated'),
    [],
  );
  expect(refreshed.dependencies.filter((item) => item.kind === 'content')).toEqual(
    expect.arrayContaining(entry.dependencies.filter((item) => item.kind === 'content')),
  );
});
