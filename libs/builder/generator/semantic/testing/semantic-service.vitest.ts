import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';

import type { ApiDescriptor, DiscoverySnapshot, GuideDescriptor } from '../../contracts';
import { createSemanticService, declarationIdentity } from '../semantic-service';

const root = resolve(__dirname, '../../../../..');
let directory: string;
let service: ReturnType<typeof createSemanticService>;
const write = (path: string, text: string) => {
  mkdirSync(join(directory, path, '..'), { recursive: true });
  writeFileSync(join(directory, path), text);
};
function snapshot(): DiscoverySnapshot {
  const common = {
    source: { path: join(directory, 'entry.ts') },
    title: 'Reference',
    route: 'api',
    absoluteRoute: 'docs/api',
    breadcrumbs: ['Reference'],
    runtimeImport: { source: join(directory, 'entry.ts'), exportName: 'default' },
    dependencies: [],
  };
  return {
    configuration: {
      projectId: 'site',
      workspaceRoot: directory,
      docsRoots: [directory],
      tsConfig: join(directory, 'tsconfig.json'),
      outputRoot: join(directory, 'output'),
      cacheRoot: join(directory, 'cache'),
      routePrefix: 'docs',
      guideDirectory: 'guides',
      apiDirectory: 'api',
      assetDirectory: 'assets',
      inlineStyleLanguage: 'SCSS',
      anchorHeadings: ['h2'],
      themes: { light: 'github-light', dark: 'github-dark' },
      cacheEnabled: true,
      digest: 'config',
      executables: [],
    },
    entries: [
      {
        ...common,
        id: 'api',
        kind: 'api',
        scopes: [
          { id: 'public', name: 'Public', route: 'public', include: ['public.ts'], exclude: [] },
        ],
      } as ApiDescriptor,
      {
        ...common,
        id: 'guide',
        kind: 'guide',
        markdown: [join(directory, 'index.md')],
        hasImports: true,
      } as GuideDescriptor,
    ],
    globalKeywords: [],
    remoteKeywords: [],
  };
}
const sync = (discovery = snapshot(), signal = new AbortController().signal) =>
  service.synchronize({ generation: 1, discovery, changes: [] }, signal);
const expectClean = (result: { diagnostics: unknown[] }) => expect(result.diagnostics).toEqual([]);
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'semantic-'));
  write(
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: {
        noLib: true,
        target: 'ES2022',
        experimentalDecorators: true,
        strict: true,
      },
      include: ['*.ts'],
    }),
  );
  write(
    'entry.ts',
    '/** Guide **summary**.\n * @status:experimental\n */\nconst Page = {}; export default Page;',
  );
  write(
    'public.ts',
    'export interface First { value: string } export interface Second { count: number }',
  );
  service = createSemanticService();
});
afterEach(async () => {
  await service.dispose();
  rmSync(directory, { recursive: true, force: true });
});

test('enumerates every symbol with stable checkout-independent identity and JSON-only results', async () => {
  expectClean(await sync());
  const result = service.enumerateApi('api');
  expectClean(result);
  expect(result.value?.map((item) => item.name)).toEqual(['First', 'Second']);
  expect(result.value?.[0].route).toBe('docs/api/interfaces/public/First');
  expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  const id = result.value![0].id;
  expect(id).toBe(
    declarationIdentity(
      'site',
      'api',
      'public',
      '/another-checkout',
      '/another-checkout/public.ts',
      'First',
    ),
  );
  expect(result.value![1].id).not.toBe(id);
  expect(service.inspect()).toEqual({ projects: 1, declarations: 2 });
});

test('disambiguates same-route declarations before rendering and preserves the lexical-last legacy base owner', async () => {
  for (const name of ['api', 'category', 'page']) {
    write(
      `schematics/${name}/index.ts`,
      `/** Unique ${name} documentation. */ export function generate() { return '${name}'; }`,
    );
  }
  const discovery = snapshot();
  const api = discovery.entries[0] as ApiDescriptor;
  api.scopes[0].include = [
    'schematics/page/index.ts',
    'schematics/api/index.ts',
    'schematics/category/index.ts',
  ];
  expectClean(await sync(discovery));
  const first = service.enumerateApi('api');
  expect(first.value).toHaveLength(3);
  expect(first.diagnostics.map((item) => item.code)).toEqual([
    'SEMANTIC_ROUTE_DISAMBIGUATED',
    'SEMANTIC_ROUTE_DISAMBIGUATED',
  ]);
  const routes = first.value!.map((declaration) => ({
    id: declaration.id,
    route: declaration.route,
    keywords: declaration.exportedKeywords,
  }));
  expect(new Set(routes.map((item) => item.route)).size).toBe(3);
  const base = 'docs/api/functions/public/generate';
  expect(
    first.value!.find((declaration) => declaration.source.path.endsWith('/page/index.ts')),
  ).toMatchObject({
    route: base,
    exportedKeywords: [{ key: 'generate', title: 'generate', path: base }],
  });
  for (const name of ['api', 'category']) {
    const suffix = createHash('sha256')
      .update(`schematics/${name}/index.ts#generate`)
      .digest('hex')
      .slice(0, 12);
    const declaration = first.value!.find((item) =>
      item.source.path.endsWith(`/${name}/index.ts`),
    )!;
    expect(declaration).toMatchObject({
      route: `${base}--${suffix}`,
      exportedKeywords: [{ key: `generate--${suffix}`, path: `${base}--${suffix}` }],
    });
    const rendered = service.renderFragment({
      kind: 'api-page',
      target: 'declaration',
      declarationId: declaration.id,
    });
    expectClean(rendered);
    expect(rendered.value?.value).toContain(`Unique ${name} documentation`);
  }
  expect(service.enumerateApi('api')).toEqual(first);
  write(
    'schematics/api/index.ts',
    '/** Edited implementation. */ export function generate() { return 42; }',
  );
  api.scopes[0].include.reverse();
  expectClean(await sync(discovery));
  expect(
    service.enumerateApi('api').value!.map((declaration) => ({
      id: declaration.id,
      route: declaration.route,
      keywords: declaration.exportedKeywords,
    })),
  ).toEqual(routes);
  const secondRoot = mkdtempSync(join(tmpdir(), 'semantic-route-relocated-'));
  const other = createSemanticService();
  try {
    writeFileSync(
      join(secondRoot, 'tsconfig.json'),
      '{"compilerOptions":{"noLib":true},"include":["**/*.ts"]}',
    );
    writeFileSync(join(secondRoot, 'entry.ts'), 'const Page = {}; export default Page;');
    for (const name of ['api', 'category', 'page']) {
      mkdirSync(join(secondRoot, 'schematics', name), { recursive: true });
      writeFileSync(
        join(secondRoot, 'schematics', name, 'index.ts'),
        `export function generate() { return '${name}'; }`,
      );
    }
    const relocated = JSON.parse(
      JSON.stringify(discovery).replaceAll(directory, secondRoot),
    ) as DiscoverySnapshot;
    expectClean(
      await other.synchronize(
        { generation: 1, discovery: relocated, changes: [] },
        new AbortController().signal,
      ),
    );
    expect(
      other.enumerateApi('api').value!.map((declaration) => ({
        id: declaration.id,
        route: declaration.route,
        keywords: declaration.exportedKeywords,
      })),
    ).toEqual(routes);
  } finally {
    await other.dispose();
    rmSync(secondRoot, { recursive: true, force: true });
  }
});

test('keeps shared aliases canonical, unique aliases available and separate scope routes unchanged', async () => {
  write(
    'a.ts',
    "declare const Component: any; @Component({ selector: 'shared, api-only' }) export class Same {}",
  );
  write(
    'z.ts',
    "declare const Component: any; @Component({ selector: 'shared, canonical-only' }) export class Same {}",
  );
  const discovery = snapshot();
  const api = discovery.entries[0] as ApiDescriptor;
  api.scopes[0].include = ['a.ts', 'z.ts'];
  expectClean(await sync(discovery));
  const result = service.enumerateApi('api');
  expect(result.value).toHaveLength(2);
  const first = result.value![0];
  const canonical = result.value![1];
  const suffix = createHash('sha256').update('a.ts#Same').digest('hex').slice(0, 12);
  expect(first.exportedKeywords.map((item) => item.key)).toEqual([
    `Same--${suffix}`,
    `shared--${suffix}`,
    'api-only',
  ]);
  expect(first.exportedKeywords.every((item) => item.path === first.route)).toBe(true);
  expect(canonical.exportedKeywords.map((item) => item.key)).toEqual([
    'Same',
    'shared',
    'canonical-only',
  ]);
  const all = result.value!.flatMap((item) => item.exportedKeywords);
  expect(new Map(all.map((item) => [item.key, item.path])).get('Same')).toBe(canonical.route);
  expect(new Map(all.reverse().map((item) => [item.key, item.path])).get('shared')).toBe(
    canonical.route,
  );
  api.scopes = [
    { id: 'first', name: 'First', route: 'first', include: ['a.ts'], exclude: [] },
    { id: 'second', name: 'Second', route: 'second', include: ['z.ts'], exclude: [] },
  ];
  expectClean(await sync(discovery));
  const separated = service.enumerateApi('api');
  expectClean(separated);
  expect(separated.value?.map((item) => item.route)).toEqual([
    'docs/api/classes/first/Same',
    'docs/api/classes/second/Same',
  ]);
});

test('reserves existing public routes, extends a conflicting suffix and diagnoses exhausted allocation', async () => {
  write('a.ts', 'export function generate() {}');
  write('z.ts', 'export function generate() {}');
  const discovery = snapshot();
  (discovery.entries[0] as ApiDescriptor).scopes[0].include = ['a.ts', 'z.ts'];
  const hash = createHash('sha256').update('a.ts#generate').digest('hex');
  const base = 'docs/api/functions/public/generate';
  const guide = discovery.entries[1] as GuideDescriptor;
  guide.absoluteRoute = `${base}--${hash.slice(0, 12)}`;
  expectClean(await sync(discovery));
  expect(service.enumerateApi('api').value![0].route).toBe(`${base}--${hash}`);
  discovery.entries.push({ ...guide, id: 'another-guide', absoluteRoute: `${base}--${hash}` });
  expectClean(await sync(discovery));
  const failed = service.enumerateApi('api');
  expect(failed.value).toBeUndefined();
  expect(failed.diagnostics).toContainEqual(
    expect.objectContaining({
      code: 'SEMANTIC_ROUTE_COLLISION',
      severity: 'error',
      source: { path: join(directory, 'a.ts'), line: 1 },
    }),
  );
});

test('orders equal-source collision ties deterministically and reserves declarations from other enumerated API entries', async () => {
  write('a.ts', 'export function generate() {}');
  write('z.ts', 'export function generate() {}');
  const discovery = snapshot();
  const api = discovery.entries[0] as ApiDescriptor;
  api.scopes = [
    { id: 'a-scope', name: 'A', route: 'public', include: ['a.ts'], exclude: [] },
    { id: 'z-scope', name: 'Z', route: 'public', include: ['a.ts'], exclude: [] },
  ];
  // This separately enumerated entry has a unique public route; it must remain unchanged.
  discovery.entries.push({
    ...api,
    id: 'other-api',
    route: 'other',
    absoluteRoute: 'docs/other',
    scopes: [{ id: 'other', name: 'Other', route: 'public', include: ['z.ts'], exclude: [] }],
  });
  expectClean(await sync(discovery));
  expectClean(service.enumerateApi('other-api'));
  const first = service.enumerateApi('api');
  expect(first.value).toHaveLength(2);
  expect(new Set(first.value?.map((item) => item.route)).size).toBe(2);
  expect(service.enumerateApi('api')).toEqual(first);
  api.scopes.reverse();
  expectClean(await sync(discovery));
  const reordered = service.enumerateApi('api');
  expect(new Map(reordered.value?.map((item) => [item.id, item.route]))).toEqual(
    new Map(first.value?.map((item) => [item.id, item.route])),
  );
});

test('real file update, new export, reexport, inheritance, delete and recovery replace the bounded Project', async () => {
  write('base.ts', 'export interface Base { inherited: string }');
  write(
    'public.ts',
    "import { Base } from './base'; export interface First extends Base { own: number }; export {Base as Renamed} from './base';",
  );
  expectClean(await sync());
  const first = service.enumerateApi('api');
  expectClean(first);
  expect(first.value?.map((item) => item.name)).toEqual(['First', 'Base']);
  const rendered = service.renderFragment({
    kind: 'api-page',
    target: 'declaration',
    declarationId: first.value![0].id,
  });
  expectClean(rendered);
  expect(rendered.value?.value).toContain('inherited');
  expect(rendered.dependencies).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: 'content', path: join(directory, 'base.ts') }),
    ]),
  );
  write('base.ts', 'export interface Base { updated: number }');
  expectClean(await sync());
  const changed = service.enumerateApi('api');
  const changedHtml = service.renderFragment({
    kind: 'api-page',
    target: 'declaration',
    declarationId: changed.value!.find((item) => item.name === 'First')!.id,
  });
  expectClean(changedHtml);
  expect(changedHtml.value?.value).toContain('updated');
  expect(changedHtml.value?.value).not.toContain('dataSlug="inherited"');
  write('public.ts', 'export const New = 42;');
  expectClean(await sync());
  expect(service.enumerateApi('api').value?.map((item) => item.name)).toEqual(['New']);
  expect(
    service.renderFragment({
      kind: 'api-header',
      target: 'declaration',
      declarationId: first.value![0].id,
    }).diagnostics[0].code,
  ).toBe('SEMANTIC_DECLARATION_MISSING');
  unlinkSync(join(directory, 'public.ts'));
  expectClean(await sync());
  expect(service.enumerateApi('api').value).toEqual([]);
  write('public.ts', 'export enum Recovery { OK }');
  expectClean(await sync());
  expect(service.enumerateApi('api').value?.[0].name).toBe('Recovery');
});

test('keeps re-export aliases consistent with legacy actual-declaration identity and rendering', async () => {
  write('base.ts', '/** Base docs. */ export interface Base { value: string }');
  write('public.ts', "export { Base, Base as Renamed, Base as OtherAlias } from './base';");
  expectClean(await sync());
  const declarations = service.enumerateApi('api');
  expectClean(declarations);
  expect(declarations.value).toHaveLength(1);
  expect(declarations.value?.[0]).toMatchObject({
    name: 'Base',
    route: 'docs/api/interfaces/public/Base',
    breadcrumbs: ['Reference', 'Public', 'Base'],
    exportedKeywords: [{ key: 'Base', title: 'Base', path: 'docs/api/interfaces/public/Base' }],
  });
  const header = service.renderFragment({
    kind: 'api-header',
    target: 'declaration',
    declarationId: declarations.value![0].id,
  });
  expectClean(header);
  expect(header.value?.value).toMatch(/<h1[^>]*>\s*Base\s*<\/h1>/);
  expect(header.value?.value).not.toContain('Renamed');
  const embedded = service.renderFragment({
    kind: 'api',
    entryId: 'guide',
    declarationPath: 'public.ts#Renamed',
  });
  expectClean(embedded);
  expect(embedded.value?.value).toContain('id="Base" title="Base"');
});

test('preserves non-error diagnostics from the evaluated guide-values port', async () => {
  await service.dispose();
  service = createSemanticService({
    readGuideValues: () => ({
      value: { playgrounds: {} },
      dependencies: [],
      diagnostics: [
        {
          code: 'VALUES_WARNING',
          severity: 'warning',
          stage: 'evaluation',
          message: 'Values were recovered with a warning',
          source: { path: join(directory, 'entry.ts') },
        },
      ],
    }),
  });
  expectClean(await sync());
  const result = service.describeGuide('guide');
  expect(result.value).toEqual({ demos: {}, playgrounds: [] });
  expect(result.diagnostics).toEqual([
    expect.objectContaining({
      code: 'VALUES_WARNING',
      severity: 'warning',
      stage: 'evaluation',
    }),
  ]);
});

test('renders rich class/interface/function/enum/typealias/variable templates and header', async () => {
  write(
    'public.ts',
    `/** Rich description.\n * @remarks More **remarks**.\n * @example Example text.\n * @see Other\n * @usageNotes Useful notes.\n */
export class Rich {
/** Member description. */ value: string = '';
/** Method.\n * @param arg - First line\n * second line\n * @returns Returned value.\n */ method(arg: string): string { return arg; } }
export interface Shape { prop: string; call(arg: number): boolean }
export function compute(value: number): number { return value; }
export enum Choice { A, B }
export type Pair = [string, number];
/** Variable docs */ export const constant = 1;`,
  );
  expectClean(await sync());
  const declarations = service.enumerateApi('api').value!;
  for (const declaration of declarations) {
    const page = service.renderFragment({
      kind: 'api-page',
      target: 'declaration',
      declarationId: declaration.id,
    });
    expectClean(page);
    expect(typeof page.value?.value).toBe('string');
    const header = service.renderFragment({
      kind: 'api-header',
      target: 'declaration',
      declarationId: declaration.id,
    });
    expectClean(header);
    expect(header.value?.value).toContain(declaration.name);
  }
  const rich = service.renderFragment({
    kind: 'api-page',
    target: 'declaration',
    declarationId: declarations.find((item) => item.name === 'Rich')!.id,
  }).value!.value as string;
  for (const text of [
    'Rich description',
    'remarks',
    'Example text',
    'Useful notes',
    'Returned value',
    'second line',
  ])
    expect(rich).toContain(text);
  const embedded = service.renderFragment({
    kind: 'api',
    entryId: 'guide',
    declarationPath: './public.ts#Rich',
  });
  expectClean(embedded);
  expect(embedded.value?.value).toContain('ng-doc-keyword-scope');
  expect(embedded.value?.value).not.toContain('Useful notes');
  expectClean(
    service.renderFragment({
      kind: 'api-details',
      entryId: 'guide',
      declarationPath: './public.ts#Rich',
    }),
  );
});

test('TSDoc actions preserve tags, multiline parameters, returns, status and guide header metadata', async () => {
  write(
    'public.ts',
    '/** Summary **bold**.\n * @remarks First remark\n * @remarks Second remark\n * @status:deprecated\n */ export function test() {}',
  );
  expectClean(await sync());
  const request = { entryId: 'guide', declarationPath: './public.ts#test' };
  expect(service.renderFragment({ ...request, kind: 'js-doc' }).value?.value).toContain(
    '<strong>bold</strong>',
  );
  expect(
    service.renderFragment({ ...request, kind: 'js-doc-tag', tag: 'remarks' }).value?.value,
  ).toContain('First remark');
  expect(
    service.renderFragment({ ...request, kind: 'js-doc-tags', tag: 'remarks' }).value?.value,
  ).toHaveLength(2);
  expect(
    service.renderFragment({ ...request, kind: 'js-doc-has-tag', tag: 'remarks' }).value?.value,
  ).toBe(true);
  expect(service.renderFragment({ ...request, kind: 'js-doc-has-tag' }).value?.value).toBe(false);
  expect(service.renderFragment({ ...request, kind: 'js-doc-tag' }).value?.value).toBe('');
  const header = service.renderFragment({ kind: 'entry-doc', entryId: 'guide' });
  expectClean(header);
  expect(header.value?.value).toMatchObject({
    description: expect.stringContaining('Guide'),
    tags: { status: [':experimental'] },
  });
});

test('a partial that fails to compile is a render diagnostic with a partial dependency; a fix recovers', async () => {
  const escaped: unknown[] = [];
  const onEscape = (error: unknown) => escaped.push(error);
  process.on('uncaughtException', onEscape);
  process.on('unhandledRejection', onEscape);
  try {
    service = createSemanticService({ templateRoot: join(directory, 'templates') });
    expectClean(await sync());
    const declarationId = service.enumerateApi('api').value![0].id;
    const partial = join(directory, 'templates/partial.html.nunj');
    // The first declaration is an interface, which the symbol view renders.
    write('templates/symbol/page.html.nunj', 'ok{% include "partial.html.nunj" %}');
    write('templates/partial.html.nunj', '\n{% endif %}');
    const broken = service.renderFragment({
      kind: 'api-page',
      target: 'declaration',
      declarationId,
    });
    await new Promise((done) => setTimeout(done, 20));
    expect(escaped).toEqual([]);
    expect(broken.value).toBeUndefined();
    expect(broken.diagnostics).toEqual([
      expect.objectContaining({ code: 'SEMANTIC_FAILED', severity: 'error', stage: 'semantic' }),
    ]);
    expect(broken.diagnostics[0].message).toContain(`(${partial}) [Line 2, Column`);
    expect(broken.dependencies).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'content', path: partial })]),
    );
    write('templates/partial.html.nunj', '<b>fixed</b>');
    const fixed = service.renderFragment({
      kind: 'api-page',
      target: 'declaration',
      declarationId,
    });
    expectClean(fixed);
    expect(fixed.value).toEqual({ format: 'html', value: 'ok<b>fixed</b>' });
  } finally {
    process.off('uncaughtException', onEscape);
    process.off('unhandledRejection', onEscape);
  }
});

test('missing includes are observed failed dependencies; custom renderer failures are structured', async () => {
  service = createSemanticService({ templateRoot: join(directory, 'templates') });
  expectClean(await sync());
  const declarationId = service.enumerateApi('api').value![0].id;
  write('templates/symbol/page.html.nunj', '{% include "missing.html.nunj" %}');
  const missing = service.renderFragment({
    kind: 'api-page',
    target: 'declaration',
    declarationId,
  });
  expect(missing.value).toBeUndefined();
  expect(missing.dependencies).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: 'existence',
        path: join(directory, 'templates/missing.html.nunj'),
        exists: false,
      }),
    ]),
  );
  await service.dispose();
  service = createSemanticService({
    markdown: () => {
      throw 'render failed';
    },
  });
  expectClean(await sync());
  expect(
    service.renderFragment({ kind: 'entry-doc', entryId: 'guide' }).diagnostics[0].message,
  ).toBe('render failed');
});

test('failures are recoverable and stale/aborted/disposed synchronization never publishes', async () => {
  expect(service.enumerateApi('api').diagnostics[0].code).toBe('SEMANTIC_NOT_READY');
  write('tsconfig.json', '{ broken');
  expect((await sync()).diagnostics[0].code).toBe('SEMANTIC_CONFIG');
  write('tsconfig.json', '{"compilerOptions":{"noLib":true,"target":"ES2022"},"include":["*.ts"]}');
  write('public.ts', 'export interface {');
  expect((await sync()).diagnostics[0].code).toBe('SEMANTIC_SYNTAX');
  write('public.ts', 'export interface OK {}');
  expectClean(await sync());
  expect(service.enumerateApi('missing').diagnostics[0].code).toBe('SEMANTIC_ENTRY_MISSING');
  expect(service.enumerateApi('guide').diagnostics[0].code).toBe('SEMANTIC_ENTRY_KIND');
  expect(service.describeGuide('api').diagnostics[0].code).toBe('SEMANTIC_ENTRY_KIND');
  for (const declarationPath of [
    'invalid',
    'public.ts#Absent',
    'public.ts#OK#extra',
    'absent.ts#Thing',
  ])
    expect(
      service.renderFragment({ kind: 'api', entryId: 'guide', declarationPath }).value,
    ).toBeUndefined();
  const controller = new AbortController();
  controller.abort();
  expect((await sync(snapshot(), controller.signal)).diagnostics[0].code).toBe(
    'SEMANTIC_CANCELLED',
  );
  const first = sync();
  const second = sync();
  expect((await first).diagnostics[0].code).toBe('SEMANTIC_SUPERSEDED');
  expectClean(await second);
  const pending = sync();
  await service.dispose();
  await service.dispose();
  expect((await pending).diagnostics[0].code).toBe('SEMANTIC_CANCELLED');
  expect(service.inspect().projects).toBe(0);
  expect((await sync()).diagnostics[0].code).toBe('SEMANTIC_CANCELLED');
  for (const result of [
    service.enumerateApi('api'),
    service.describeGuide('guide'),
    service.renderFragment({ kind: 'entry-doc', entryId: 'guide' }),
  ]) {
    expect(result.value).toBeUndefined();
    expect(result.diagnostics[0].code).toBe('SEMANTIC_CANCELLED');
  }
});

test('scope memberships include dot directories and internal exports are omitted', async () => {
  write(
    '.hidden/entry.ts',
    '/** @internal */ export interface Secret {} export interface Visible {}',
  );
  write('public.ts', "export { Visible } from './.hidden/entry';");
  const discovery = snapshot();
  (discovery.entries[0] as ApiDescriptor).scopes[0].include = ['public.ts', '.hidden/*.ts'];
  expectClean(await sync(discovery));
  expect(service.enumerateApi('api').value?.map((entry) => entry.name)).toEqual(['Visible']);
  write(
    'public.ts',
    'export namespace Unsupported {} export default {}; export class Supported {}',
  );
  expectClean(await sync());
  const mixed = service.enumerateApi('api');
  expect(
    mixed.diagnostics.every(
      (item) => item.code === 'SEMANTIC_DECLARATION_KIND' && item.severity === 'info',
    ),
  ).toBe(true);
  expect(mixed.value?.map((item) => item.name)).toEqual(['Supported']);
});

test('two independent sessions and 100 short lifetimes/edits keep owned counters bounded', async () => {
  const other = createSemanticService();
  await other.synchronize(
    { generation: 1, discovery: snapshot(), changes: [] },
    new AbortController().signal,
  );
  const trace: unknown[] = [];
  for (let index = 0; index < 100; index++) {
    write('public.ts', `export const Value${index} = ${index};`);
    expectClean(await sync());
    expect(service.enumerateApi('api').value?.[0].name).toBe(`Value${index}`);
    expect(service.inspect()).toEqual({ projects: 1, declarations: 1 });
    if (index % 10 === 0)
      trace.push({ edit: index, memory: process.memoryUsage(), owned: service.inspect() });
    const short = createSemanticService();
    expectClean(
      await short.synchronize(
        { generation: index, discovery: snapshot(), changes: [] },
        new AbortController().signal,
      ),
    );
    expect(short.inspect().projects).toBe(1);
    await short.dispose();
    expect(short.inspect()).toEqual({ projects: 0, declarations: 0 });
  }
  expect(other.enumerateApi('api').value?.[0].name).toBe('First');
  await other.dispose();
  // Evidence is written only where a runner asks for it; a plain run never touches tracked docs.
  const requested = process.env['NGDOC_TEST_EVIDENCE_DIR'];
  const evidence = requested ?? mkdtempSync(join(tmpdir(), 'ng-doc-semantic-evidence-'));
  try {
    mkdirSync(evidence, { recursive: true });
    writeFileSync(resolve(evidence, 'lifecycle-trace.json'), JSON.stringify(trace, null, 2));
    expect(existsSync(resolve(evidence, 'lifecycle-trace.json'))).toBe(true);
  } finally {
    if (!requested) rmSync(evidence, { recursive: true, force: true });
  }
}, 30000);

test('tracks tsconfig extends, package manifests, failed resolutions and late action files', async () => {
  write('base-config.json', '{"compilerOptions":{"noLib":true,"target":"ES2022"}}');
  write('tsconfig.json', '{"extends":"./base-config.json","include":["entry.ts","public.ts"]}');
  write(
    'public.ts',
    "import type {Missing} from './missing'; export interface Consumer { value: Missing }",
  );
  const initial = await sync();
  expectClean(initial);
  expect(initial.dependencies).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: 'content', path: join(directory, 'base-config.json') }),
      { kind: 'existence', path: join(directory, 'missing.ts'), exists: false },
    ]),
  );
  write('missing.ts', 'export interface Missing { restored: string }');
  const restored = await sync();
  expectClean(restored);
  expect(restored.dependencies).toContainEqual(
    expect.objectContaining({ kind: 'content', path: join(directory, 'missing.ts') }),
  );
  write('late.ts', "import {Missing} from './missing'; export interface Late extends Missing {}");
  const late = service.renderFragment({
    kind: 'api',
    entryId: 'guide',
    declarationPath: './late.ts#Late',
  });
  expectClean(late);
  expect(late.value?.value).toContain('restored');
  const repeated = service.renderFragment({
    kind: 'api',
    entryId: 'guide',
    declarationPath: './late.ts#Late',
  });
  expect(repeated.dependencies).toEqual(late.dependencies);
  expect(late.dependencies).toContainEqual(
    expect.objectContaining({ kind: 'content', path: join(directory, 'missing.ts') }),
  );
  write('node_modules/example/package.json', '{"name":"example","types":"index.d.ts"}');
  write('node_modules/example/index.d.ts', 'export interface Package { value: string }');
  write(
    'public.ts',
    "import {Package} from 'example'; export interface Consumer extends Package {}",
  );
  const result = await sync();
  expectClean(result);
  expect(result.dependencies).toContainEqual(
    expect.objectContaining({
      kind: 'content',
      path: join(directory, 'node_modules/example/package.json'),
    }),
  );
});

test('workspace-root action paths remain valid for guides in nested directories', async () => {
  write('nested/entry.ts', 'export default {}');
  const discovery = snapshot();
  discovery.entries[1].source.path = join(directory, 'nested/entry.ts');
  expectClean(await sync(discovery));
  const fragment = service.renderFragment({
    kind: 'api',
    entryId: 'guide',
    declarationPath: 'public.ts#First',
  });
  expectClean(fragment);
  expect(fragment.value?.value).toContain('value');
  expect(fragment.value?.value).not.toContain('\n');
});

test('callable interfaces and object type aliases retain full property tables and Unicode names', async () => {
  write(
    'public.ts',
    '/** Callable description. */\nexport interface Callable { /** Call docs */\n(value: string): number; field: boolean }\nexport type Übersicht = { größe: string; count?: number };',
  );
  expectClean(await sync());
  const declarations = service.enumerateApi('api').value!;
  const callable = service.renderFragment({
    kind: 'api-page',
    target: 'declaration',
    declarationId: declarations.find((item) => item.name === 'Callable')!.id,
  });
  expectClean(callable);
  expect(callable.value?.value).toContain('Call Signatures');
  expect(callable.value?.value).toContain('field');
  const alias = service.renderFragment({
    kind: 'api-page',
    target: 'declaration',
    declarationId: declarations.find((item) => item.name === 'Übersicht')!.id,
  });
  expectClean(alias);
  expect(alias.value?.value).toContain('größe');
  expect(alias.value?.value).toContain('count');
});

test('independent workspace formatter configurations and edits affect real API rendering without chdir', async () => {
  const secondRoot = mkdtempSync(join(tmpdir(), 'semantic-format-'));
  const other = createSemanticService();
  const cwd = process.cwd();
  try {
    write('public.ts', "export type Words = 'alpha' | 'beta';");
    write('.prettierrc', '{"singleQuote":true}');
    writeFileSync(join(secondRoot, 'public.ts'), "export type Words = 'alpha' | 'beta';");
    writeFileSync(join(secondRoot, 'entry.ts'), 'export default {};');
    writeFileSync(
      join(secondRoot, 'tsconfig.json'),
      '{"compilerOptions":{"noLib":true,"target":"ES2022"},"include":["*.ts"]}',
    );
    writeFileSync(join(secondRoot, '.prettierrc'), '{"singleQuote":false}');
    const otherDiscovery = JSON.parse(
      JSON.stringify(snapshot()).replaceAll(directory, secondRoot),
    ) as DiscoverySnapshot;
    expectClean(await sync());
    expectClean(
      await other.synchronize(
        { generation: 1, discovery: otherDiscovery, changes: [] },
        new AbortController().signal,
      ),
    );
    const id = service.enumerateApi('api').value![0].id;
    const otherId = other.enumerateApi('api').value![0].id;
    const first = service.renderFragment({
      kind: 'api-page',
      target: 'declaration',
      declarationId: id,
    });
    const second = other.renderFragment({
      kind: 'api-page',
      target: 'declaration',
      declarationId: otherId,
    });
    expectClean(first);
    expectClean(second);
    expect(first.value?.value).not.toBe(second.value?.value);
    write('.prettierrc', '{"singleQuote":false}');
    expectClean(await sync());
    service.enumerateApi('api');
    const edited = service.renderFragment({
      kind: 'api-page',
      target: 'declaration',
      declarationId: id,
    });
    expectClean(edited);
    expect(edited.value?.value).toBe(second.value?.value);
    expect(edited.dependencies).toContainEqual(
      expect.objectContaining({ kind: 'content', path: join(directory, '.prettierrc') }),
    );
    expect(process.cwd()).toBe(cwd);
  } finally {
    await other.dispose();
    rmSync(secondRoot, { recursive: true, force: true });
  }
});

test('native TypeScript6 validates current main application tsconfig', async () => {
  const discovery = snapshot();
  discovery.configuration.workspaceRoot = root;
  discovery.configuration.tsConfig = resolve(root, 'apps/ng-doc/tsconfig.app.json');
  discovery.configuration.outputRoot = resolve(root, 'ng-doc/ng-doc');
  discovery.entries = [];
  const result = await sync(discovery);
  expectClean(result);
  expect(result.value).toBeNull();
  expect(result.dependencies).toContainEqual(
    expect.objectContaining({ kind: 'content', path: resolve(root, 'tsconfig.base.json') }),
  );
}, 120000);

test('unknown configuration typos remain structured diagnostics with native TypeScript6', async () => {
  write(
    'tsconfig.json',
    '{"compilerOptions":{"noUncheckedSideEffectImportz":false},"include":["*.ts"]}',
  );
  const result = await sync();
  expect(result.value).toBeUndefined();
  expect(result.diagnostics[0]).toMatchObject({
    code: 'SEMANTIC_CONFIG',
    message: expect.stringContaining('noUncheckedSideEffectImportz'),
  });
});

test('native TypeScript6 supports omitted target/module defaults and new compiler options', async () => {
  write(
    'tsconfig.json',
    '{"compilerOptions":{"noLib":true,"noUncheckedSideEffectImports":true,"noCheck":true},"include":["*.ts"]}',
  );
  expectClean(await sync());
  expect(service.enumerateApi('api').value?.map((item) => item.name)).toEqual(['First', 'Second']);
  write(
    'tsconfig.json',
    '{"compilerOptions":{"target":"ES2025","module":"Node20","noLib":true},"include":["*.ts"]}',
  );
  expectClean(await sync());
  expect(service.enumerateApi('api').value?.[0].name).toBe('First');
});

test('tracks installed physical TypeScript libraries for filesystem cache refresh', async () => {
  write(
    'tsconfig.json',
    JSON.stringify({ compilerOptions: { target: 'ES2022', types: [] }, include: ['*.ts'] }),
  );
  const result = await sync();
  expectClean(result);
  const libraries = result.dependencies.filter(
    (item) => item.kind === 'content' && item.path.includes('/typescript/lib/'),
  );
  expect(libraries.length).toBeGreaterThan(1);
  for (const dependency of libraries) {
    if (dependency.kind === 'content')
      expect(existsSync(dependency.path), dependency.path).toBe(true);
  }
  expect(
    result.dependencies.some(
      (item) => 'path' in item && item.path.startsWith('/node_modules/typescript/lib/'),
    ),
  ).toBe(false);
});

test('scope-reference query mode retains full synchronization provenance without copying it into every fragment', async () => {
  const compactService = createSemanticService({ dependencyMode: 'scope-reference' });
  try {
    const synchronized = await compactService.synchronize(
      { generation: 1, discovery: snapshot(), changes: [] },
      new AbortController().signal,
    );
    expectClean(synchronized);
    const scope = synchronized.dependencies.find((item) => item.kind === 'semantic')!;
    const declarations = compactService.enumerateApi('api');
    expectClean(declarations);
    const rendered = compactService.renderFragment({
      kind: 'api-page',
      target: 'declaration',
      declarationId: declarations.value![0].id,
    });
    expectClean(rendered);
    expect(rendered.value?.value).toContain('value');
    for (const result of [declarations, rendered]) {
      expect(result.dependencies.filter((item) => item.kind === 'semantic')).toEqual([]);
      expect(result.dependencies.find((item) => item.kind === 'semantic-reference')).toEqual({
        kind: 'semantic-reference',
        scopeId: scope.scopeId,
        digest: scope.digest,
        reason: scope.reason,
      });
    }
    expect(
      synchronized.dependencies.some(
        (item) => item.kind === 'content' && item.path === join(directory, 'public.ts'),
      ),
    ).toBe(true);
    expect(
      rendered.dependencies.some(
        (item) => item.kind === 'content' && item.path.includes('templates'),
      ),
    ).toBe(true);
  } finally {
    await compactService.dispose();
  }
});

test('merged exports preserve legacy class routes and first-public rendered documentation', async () => {
  write(
    'public.ts',
    `
interface Base { inheritedMember: string }
export interface Merged extends Base { interfaceOnly: string }
export abstract class Merged { classOnly = 1; }
export namespace Merged { export const companion = 1; }
export interface Visible { publicMember: string }
/* @internal is deliberately JSDoc below. */
/** @internal */ export class Visible { hiddenMember = 1; }
/** First overload documentation. */ export function overload(value: string): string;
export function overload(value: unknown): unknown { return value; }
`,
  );
  expectClean(await sync());
  const result = service.enumerateApi('api');
  expectClean(result);
  expect(result.value).toHaveLength(3);
  const merged = result.value!.find((item) => item.name === 'Merged')!;
  expect(merged.route).toBe('docs/api/classes/public/Merged');
  expect(merged.exportedKeywords).toContainEqual({
    key: 'Merged',
    title: 'Merged',
    path: merged.route,
  });
  const fragment = service.renderFragment({
    kind: 'api-page',
    target: 'declaration',
    declarationId: merged.id,
  });
  expectClean(fragment);
  expect(fragment.value?.value).toContain('interfaceOnly');
  expect(fragment.value?.value).toContain('inheritedMember');
  expect(
    service.renderFragment({
      kind: 'api-page',
      target: 'declaration',
      declarationId: result.value!.find((item) => item.name === 'overload')!.id,
    }).value?.value,
  ).toContain('First overload documentation.');
  expect(result.value!.find((item) => item.name === 'Visible')?.route).toBe(
    'docs/api/interfaces/public/Visible',
  );
  expect(service.enumerateApi('api')).toEqual(result);
});
