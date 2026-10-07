import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';

import { GeneratorContentCompiler } from '../content/content-compiler';
import type {
  ArtifactSnapshot,
  CompilationContext,
  CompilationResult,
  FileChange,
} from '../contracts';
import {
  type CompilationOptions,
  createCompilationService,
  resetIncrementalRetention,
  resetTargetedDryRun,
} from './index';
import { SCOPED_SEMANTIC_MISMATCH, SHAPE_CLOSURE_MISMATCH } from './semantic-closure';

// Union member order. Without `stableTypeOrdering` TypeScript orders the members of a union by the
// creation order of their types, so a page rendered again on a new checker without the pages a cold
// build renders before it could print `B | A` where the cold build prints `A | B`. The semantic
// service builds its program with `stableTypeOrdering` (members ordered by kind, name, value and
// declaration position, unnamed types by their files' program order; a closure record holds only
// while no two files swap places): every incremental result equals the switches turned off, the
// reference path and a cold build byte for byte, and `verify` finds no mismatch.

const cleanup: Array<() => unknown> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
  resetIncrementalRetention();
  resetTargetedDryRun();
});

const templates = path.resolve(import.meta.dirname, '../../templates');

interface Variant {
  name: string;
  /** Source files under `src/`; `index.ts` re-exports the documented ones. */
  sources: Record<string, string>;
  /** More files under `docs/` (pages); with them the workspace links `node_modules`. */
  docs?: Record<string, string>;
  /** More files under the workspace root (a package under `node_modules`). */
  extra?: Record<string, string>;
  /** The body edit of the page whose union prints, and the union text a cold build prints. */
  edit: { file: string; from: string; to: string };
  page: string;
  union: RegExp;
  /** The API pages the edit renders again with every switch on (default: `page`). */
  rendered?: string[];
}

const variants: Variant[] = [
  {
    // The reported case: `aError` renders `BuilderError` before `emitFileOutput` in a cold build.
    name: 'named types of one file',
    sources: {
      'result.ts':
        'export interface BuilderDone {\n  done: true;\n}\nexport interface BuilderError {\n  error: string;\n}\n',
      'a.ts':
        "import type { BuilderError } from './result';\n/** Fails. */\nexport function aError(): BuilderError {\n  return { error: 'a' };\n}\n",
      'emit.ts':
        "import type { BuilderDone, BuilderError } from './result';\n/** Emits. */\nexport function emitFileOutput(): BuilderDone | BuilderError {\n  return { done: true };\n}\n",
      'index.ts': "export * from './a';\nexport * from './emit';\n",
    },
    edit: { file: 'emit.ts', from: 'done: true };', to: 'done: true as const };' },
    page: 'emitFileOutput',
    union: /BuilderDone \| BuilderError|BuilderError \| BuilderDone/,
  },
  {
    name: 'named types across three files',
    sources: {
      'done.ts': 'export interface Done {\n  done: true;\n}\n',
      'failed.ts': 'export interface Failed {\n  error: string;\n}\n',
      'skipped.ts': 'export interface Skipped {\n  skipped: true;\n}\n',
      'a.ts':
        "import type { Skipped } from './skipped';\n/** Skips. */\nexport function skip(): Skipped {\n  return { skipped: true };\n}\n",
      'b.ts':
        "import type { Failed } from './failed';\n/** Fails. */\nexport function fail(): Failed {\n  return { error: 'b' };\n}\n",
      'emit.ts':
        "import type { Done } from './done';\nimport type { Failed } from './failed';\nimport type { Skipped } from './skipped';\n/** Emits. */\nexport function emit(): Done | Failed | Skipped {\n  return { done: true };\n}\n",
      'index.ts': "export * from './a';\nexport * from './b';\nexport * from './emit';\n",
    },
    edit: { file: 'emit.ts', from: 'done: true };', to: 'done: true as const };' },
    page: 'emit',
    union: /(Done|Failed|Skipped) \| (Done|Failed|Skipped) \| (Done|Failed|Skipped)/,
  },
  {
    name: 'instantiations of a generic type',
    sources: {
      'box.ts': 'export interface Box<T> {\n  value: T;\n}\n',
      'a.ts':
        "import type { Box } from './box';\n/** A text box. */\nexport function text(): Box<string> {\n  return { value: 'a' };\n}\n",
      'emit.ts':
        "import type { Box } from './box';\n/** Either box. */\nexport function either(): Box<number> | Box<string> {\n  return { value: 1 };\n}\n",
      'index.ts': "export * from './a';\nexport * from './emit';\n",
    },
    edit: { file: 'emit.ts', from: 'value: 1 };', to: 'value: 2 };' },
    page: 'either',
    union: /Box(&#x3C;|<)(number|string)> \| Box(&#x3C;|<)(number|string)>/,
  },
  {
    name: 'a union of literal types',
    sources: {
      'a.ts': "/** The second mode. */\nexport function second(): 'b' {\n  return 'b';\n}\n",
      'emit.ts':
        "/** Any mode. */\nexport function mode(flag: boolean): 'a' | 'b' {\n  return flag ? 'a' : 'b';\n}\n",
      'index.ts': "export * from './a';\nexport * from './emit';\n",
    },
    edit: { file: 'emit.ts', from: "flag ? 'a' : 'b'", to: "!flag ? 'b' : 'a'" },
    page: 'mode',
    union: /(&quot;|&#39;|")[ab](&quot;|&#39;|") \| (&quot;|&#39;|")[ab](&quot;|&#39;|")/,
  },
  {
    // Two literals no annotation writes, created while inferring: `third`, rendered again without
    // `first` before it, would infer them in its own order.
    name: 'an inferred literal union',
    sources: {
      'a.ts':
        "declare const flag: boolean;\n/** First. */\nexport const first = flag ? 'y' : 'x';\n",
      'c.ts':
        "declare const flag: boolean;\n/** Third. */\nexport const third = flag ? 'x' : 'y';\n/** Touches. */\nexport function touch(): number {\n  return 1;\n}\n",
      'index.ts': "export * from './a';\nexport * from './c';\n",
    },
    edit: { file: 'c.ts', from: 'return 1;', to: 'return 2;' },
    page: 'third',
    rendered: ['third', 'touch'],
    union: /"[xy]" \| "[xy]"/,
  },
  {
    // A type alias the documented page never reads orders the literals it creates first: its
    // reorder must not change the page.
    name: 'a reordered alias of the same literals',
    sources: {
      'order.ts': "export type Order = 'x' | 'y';\n",
      'p.ts':
        "declare const flag: boolean;\n/** Picks. */\nexport const pick = flag ? 'x' : 'y';\n",
      'index.ts': "export * from './p';\n",
    },
    edit: { file: 'order.ts', from: "'x' | 'y'", to: "'y' | 'x'" },
    page: 'pick',
    rendered: [],
    union: /"[xy]" \| "[xy]"/,
  },
  {
    // Named types of two files are ordered by the program's file order; an import added to a file
    // no page reads moves `b.ts` before `a.ts`.
    name: 'a change of the file order',
    sources: {
      '0.ts': 'export const zero = 0;\n',
      'a.ts': 'export interface Alpha {\n  a: 1;\n}\n',
      'b.ts': 'export interface Beta {\n  b: 1;\n}\n',
      'emit.ts':
        "import type { Alpha } from './a';\nimport type { Beta } from './b';\n/** Emits. */\nexport function emit(): Beta | Alpha {\n  return { a: 1 };\n}\n",
      'index.ts': "export * from './emit';\n",
    },
    edit: {
      file: '0.ts',
      from: 'export const zero = 0;',
      to: "import './b';\nexport const zero = 0;",
    },
    page: 'emit',
    union: /(Alpha|Beta) \| (Alpha|Beta)/,
  }, // Types without a name (functions, object types) are ordered by their declaring file's position
  // in the program; named types sort by name first, so the variant above does not depend on it.
  // Each edit below moves two files the page's types come from past each other: every closure
  // record then refreshes as changed (`sameRelativeOrder`).
  {
    name: 'anonymous types of two workspace files whose order an unread file flips',
    sources: {
      '0.ts': 'export const zero = 0;\n',
      'a.ts': 'export declare function fa(s: string): number;\n',
      'b.ts': 'export declare function fb(n: number, m: number): string;\n',
      'emit.ts':
        "import { fa } from './a';\nimport { fb } from './b';\ndeclare const flag: boolean;\n/** Picks. */\nexport const pick = flag ? fb : fa;\n",
      'index.ts': "export * from './emit';\n",
    },
    edit: {
      file: '0.ts',
      from: 'export const zero = 0;',
      to: "import './b';\nexport const zero = 0;",
    },
    page: 'pick',
    rendered: ['pick'],
    union: /typeof f[ab] \| typeof f[ab]|\(\([^|]*\) \| \([^|]*\)/,
  },
  {
    name: 'a library file an unread file moves before a workspace file',
    sources: {
      '0.ts': 'export const zero = 0;\n',
      'a.ts': 'export declare function fa(s: string): number;\n',
      'emit.ts':
        "import { fa } from './a';\nimport { noop } from 'rxjs';\ndeclare const flag: boolean;\n/** Picks. */\nexport const pick = flag ? noop : fa;\n",
      'index.ts': "export * from './emit';\n",
    },
    docs: {
      'guide/ng-doc.page.ts':
        "const page = { title: 'Guide', route: 'guide', mdFile: './index.md' }; export default page;",
      'guide/index.md': '# Guide\n',
    },
    edit: {
      file: '0.ts',
      from: 'export const zero = 0;',
      to: "import 'rxjs';\nexport const zero = 0;",
    },
    page: 'pick',
    rendered: ['pick'],
    union: /typeof (fa|noop) \| typeof (fa|noop)|\(\([^|]*\) \| \([^|]*\)/,
  },
  {
    name: 'a global declaration file an unread reference moves',
    sources: {
      '0.ts': 'export const zero = 0;\n',
      'a.ts': 'export declare function fa(s: string): number;\n',
      'globals.d.ts': 'declare function gnoop(): void;\n',
      'emit.ts':
        "import { fa } from './a';\ndeclare const flag: boolean;\n/** Picks. */\nexport const pick = flag ? gnoop : fa;\n",
      'index.ts': "export * from './emit';\n",
    },
    edit: {
      file: '0.ts',
      from: 'export const zero = 0;',
      to: '/// <reference path="./globals.d.ts" />\nexport const zero = 0;',
    },
    page: 'pick',
    rendered: ['pick'],
    union: /typeof (fa|gnoop) \| typeof (fa|gnoop)|\(\([^|]*\) \| \([^|]*\)/,
  },
  {
    name: 'library-internal files an unread import reorders',
    sources: {
      '0.ts': 'export const zero = 0;\n',
      'emit.ts': "import { pick } from 'lib/u';\n/** Picks. */\nexport const picked = pick;\n",
      'index.ts': "export * from './emit';\n",
    },
    extra: {
      'node_modules/lib/package.json': '{"name":"lib","version":"1.0.0","types":"u.d.ts"}',
      'node_modules/lib/x.d.ts': 'export declare function fx(s: string): number;\n',
      'node_modules/lib/y.d.ts': 'export declare function fy(n: number, m: number): string;\n',
      'node_modules/lib/u.d.ts':
        "import { fx } from './x';\nimport { fy } from './y';\nexport declare const pick: typeof fx | typeof fy;\n",
    },
    edit: {
      file: '0.ts',
      from: 'export const zero = 0;',
      to: "import 'lib/y';\nexport const zero = 0;",
    },
    page: 'picked',
    rendered: ['picked'],
    union: /typeof f[xy] \| typeof f[xy]|\(\([^|]*\) \| \([^|]*\)/,
  },
  {
    name: 'a global-scope module on the way to the declaring files',
    sources: {
      '0.ts': 'export const zero = 0;\n',
      'a.ts': 'export declare function fa(s: string): number;\n',
      'b.ts': 'export declare function fb(n: number, m: number): string;\n',
      'aug.ts':
        "import { fa } from './a';\nimport { fb } from './b';\ndeclare global {\n  interface AugMarker {\n    m: 1;\n  }\n}\ndeclare const flag: boolean;\nexport const pick = flag ? fb : fa;\n",
      'emit.ts': "import { pick } from './aug';\n/** Picks. */\nexport const picked = pick;\n",
      'index.ts': "export * from './emit';\n",
    },
    edit: {
      file: '0.ts',
      from: 'export const zero = 0;',
      to: "import './b';\nexport const zero = 0;",
    },
    page: 'picked',
    rendered: ['picked'],
    union: /typeof f[ab] \| typeof f[ab]|\(\([^|]*\) \| \([^|]*\)/,
  },
  // Types that tie on every key of the stable order (no symbol, alias or reference target) sort
  // by type id: the canonical printed order (`semantic/type-text.ts`) sorts them by their text.
  {
    name: 'reverse-mapped types that tie on every key but the type id',
    sources: {
      'ab.ts':
        "type Box<V> = { value: V };\ndeclare function unbox<T>(x: { [K in keyof T]: Box<T[K]> }): T;\n/** Alpha. */\nexport const alpha = unbox({ p: { value: 1 } });\n/** Zeta. */\nexport const zeta = unbox({ q: { value: 's' } });\n",
      'u.ts':
        "import { alpha, zeta } from './ab';\ndeclare const flag: boolean;\n/** Either. */\nexport const u = flag ? zeta : alpha;\n/** Touches. */\nexport function touch(): number {\n  return 1;\n}\n",
      'index.ts': "export * from './ab';\nexport * from './u';\n",
    },
    edit: { file: 'u.ts', from: 'return 1;', to: 'return 2;' },
    page: 'u',
    rendered: ['touch', 'u'],
    union: /\{ [pq]: (number|string);? \} \| \{ [pq]: (number|string);? \}/,
  },
  {
    name: 'tied members inside a type reference (`Holder<R1> | Holder<R2>`)',
    sources: {
      'ab.ts':
        "type Box<V> = { value: V };\ndeclare function unbox<T>(x: { [K in keyof T]: Box<T[K]> }): T;\n/** Alpha. */\nexport const alpha = unbox({ p: { value: 1 } });\n/** Zeta. */\nexport const zeta = unbox({ q: { value: 's' } });\n",
      'u.ts':
        "import { alpha, zeta } from './ab';\ndeclare const flag: boolean;\ninterface Holder<T> {\n  held: T;\n}\ndeclare const hz: Holder<typeof zeta>;\ndeclare const ha: Holder<typeof alpha>;\n/** Either. */\nexport const u = flag ? hz : ha;\n/** Touches. */\nexport function touch(): number {\n  return 1;\n}\n",
      'index.ts': "export * from './ab';\nexport * from './u';\n",
    },
    edit: { file: 'u.ts', from: 'return 1;', to: 'return 2;' },
    page: 'u',
    rendered: ['touch', 'u'],
    union: /Holder\S{1,6}\{ [pq]: \w+;? \}\S{1,6} \| Holder\S{1,6}\{ [pq]: \w+;? \}/,
  },
  {
    name: 'tied members inside an object property',
    sources: {
      'ab.ts':
        "type Box<V> = { value: V };\ndeclare function unbox<T>(x: { [K in keyof T]: Box<T[K]> }): T;\n/** Alpha. */\nexport const alpha = unbox({ p: { value: 1 } });\n/** Zeta. */\nexport const zeta = unbox({ q: { value: 's' } });\n",
      'u.ts':
        "import { alpha, zeta } from './ab';\ndeclare const flag: boolean;\n/** Either. */\nexport const u = { a: flag ? zeta : alpha };\n/** Touches. */\nexport function touch(): number {\n  return 1;\n}\n",
      'index.ts': "export * from './ab';\nexport * from './u';\n",
    },
    edit: { file: 'u.ts', from: 'return 1;', to: 'return 2;' },
    page: 'u',
    rendered: ['touch', 'u'],
    union: /\{ [pq]: \w+;? \} \| \{ [pq]: \w+;? \}/,
  },
  {
    name: 'tied members in a function parameter',
    sources: {
      'ab.ts':
        "type Box<V> = { value: V };\ndeclare function unbox<T>(x: { [K in keyof T]: Box<T[K]> }): T;\n/** Alpha. */\nexport const alpha = unbox({ p: { value: 1 } });\n/** Zeta. */\nexport const zeta = unbox({ q: { value: 's' } });\n",
      'u.ts':
        "import { alpha, zeta } from './ab';\ndeclare const flag: boolean;\n/** Either. */\nexport function u(x: typeof zeta | typeof alpha): void {}\n/** Touches. */\nexport function touch(): number {\n  return 1;\n}\n",
      'index.ts': "export * from './ab';\nexport * from './u';\n",
    },
    edit: { file: 'u.ts', from: 'return 1;', to: 'return 2;' },
    page: 'u',
    rendered: ['touch', 'u'],
    union: /\{ [pq]: \w+;? \} \| \{ [pq]: \w+;? \}/,
  },
  {
    name: 'tied members inside a mapped alias (`M<R1> | M<R2>`)',
    sources: {
      'ab.ts':
        "type Box<V> = { value: V };\ndeclare function unbox<T>(x: { [K in keyof T]: Box<T[K]> }): T;\n/** Alpha. */\nexport const alpha = unbox({ p: { value: 1 } });\n/** Zeta. */\nexport const zeta = unbox({ q: { value: 's' } });\n",
      'u.ts':
        "import { alpha, zeta } from './ab';\ndeclare const flag: boolean;\ntype M<T> = { [K in keyof T]: T[K] };\ndeclare const mz: M<typeof zeta>;\ndeclare const ma: M<typeof alpha>;\n/** Either. */\nexport const u = flag ? mz : ma;\n/** Touches. */\nexport function touch(): number {\n  return 1;\n}\n",
      'index.ts': "export * from './ab';\nexport * from './u';\n",
    },
    edit: { file: 'u.ts', from: 'return 1;', to: 'return 2;' },
    page: 'u',
    rendered: ['touch', 'u'],
    union: /M\S{1,6}\{ [pq]: \w+;? \}\S{1,6} \| M\S{1,6}\{ [pq]: \w+;? \}/,
  },
  {
    name: 'tied members inside intersections (`(R1 & Tag) | (R2 & Tag)`)',
    sources: {
      'ab.ts':
        "type Box<V> = { value: V };\ndeclare function unbox<T>(x: { [K in keyof T]: Box<T[K]> }): T;\n/** Alpha. */\nexport const alpha = unbox({ p: { value: 1 } });\n/** Zeta. */\nexport const zeta = unbox({ q: { value: 's' } });\n",
      'u.ts':
        "import { alpha, zeta } from './ab';\ndeclare const flag: boolean;\ninterface Tag {\n  t: 1;\n}\ndeclare const iz: typeof zeta & Tag;\ndeclare const ia: typeof alpha & Tag;\n/** Either. */\nexport const u = flag ? iz : ia;\n/** Touches. */\nexport function touch(): number {\n  return 1;\n}\n",
      'index.ts': "export * from './ab';\nexport * from './u';\n",
    },
    edit: { file: 'u.ts', from: 'return 1;', to: 'return 2;' },
    page: 'u',
    rendered: ['touch', 'u'],
    union: /\(\{ [pq]: \w+;? \} (&#x26;|&) Tag\) \| \(\{ [pq]: \w+;? \} (&#x26;|&) Tag\)/,
  },
  {
    name: 'tied members in the return of a function type',
    sources: {
      'ab.ts':
        "type Box<V> = { value: V };\ndeclare function unbox<T>(x: { [K in keyof T]: Box<T[K]> }): T;\n/** Alpha. */\nexport const alpha = unbox({ p: { value: 1 } });\n/** Zeta. */\nexport const zeta = unbox({ q: { value: 's' } });\n",
      'u.ts':
        "import { alpha, zeta } from './ab';\ndeclare const flag: boolean;\n/** Either. */\nexport const u = () => (flag ? zeta : alpha);\n/** Touches. */\nexport function touch(): number {\n  return 1;\n}\n",
      'index.ts': "export * from './ab';\nexport * from './u';\n",
    },
    edit: { file: 'u.ts', from: 'return 1;', to: 'return 2;' },
    page: 'u',
    rendered: ['touch', 'u'],
    union: /\{ [pq]: \w+;? \} \| \{ [pq]: \w+;? \}/,
  },
];

interface Fixture {
  root: string;
  edit(file: string, from: string, to: string): FileChange;
  reset(): void;
  create(overrides?: Partial<CompilationOptions>): ReturnType<typeof createCompilationService>;
}

function fixture(variant: Variant): Fixture {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'ngdoc-type-order-')));
  cleanup.push(() => rmSync(root, { recursive: true, force: true }));
  if (variant.docs)
    symlinkSync(
      path.resolve(import.meta.dirname, '../../../../node_modules'),
      path.join(root, 'node_modules'),
      'dir',
    );
  const put = (file: string, content: string) => {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
    return target;
  };
  const reset = () => {
    for (const directory of ['docs', 'src', 'out'])
      rmSync(path.join(root, directory), { recursive: true, force: true });
    put(
      'tsconfig.json',
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          types: [],
          skipLibCheck: true,
          strict: true,
          experimentalDecorators: true,
        },
        include: ['docs/**/*.ts', 'src/**/*.ts'],
      }),
    );
    put('ng-doc.config.ts', `export default { docsPath: 'docs', cache: false };`);
    put(
      'docs/ng-doc.api.ts',
      `const api = { title: 'API', scopes: [{ name: 'Lib', route: 'lib', include: ['src/index.ts'] }] }; export default api;`,
    );
    for (const [file, content] of Object.entries(variant.sources)) put(`src/${file}`, content);
    for (const [file, content] of Object.entries(variant.docs ?? {})) put(`docs/${file}`, content);
    for (const [file, content] of Object.entries(variant.extra ?? {})) put(file, content);
  };
  reset();
  const options: CompilationOptions = {
    projectId: 'type-order',
    workspaceRoot: root,
    configFile: path.join(root, 'ng-doc.config.ts'),
    defaults: {
      docsRoot: path.join(root, 'docs'),
      tsConfig: path.join(root, 'tsconfig.json'),
      outputRoot: path.join(root, 'out'),
      cacheRoot: path.join(root, 'cache'),
    },
    compilerVersion: 'test-v1',
    toolchainDigest: 'real-ts6-shiki',
    templateRoot: templates,
  };
  return {
    root,
    edit: (file, from, to) => {
      const text = readFileSync(path.join(root, file), 'utf8');
      expect(text.split(from)).toHaveLength(2);
      return { kind: 'update', path: put(file, text.replace(from, to)) };
    },
    reset,
    create: (overrides = {}) => {
      const service = createCompilationService({ ...options, ...overrides });
      cleanup.push(() => service.dispose());
      return service;
    },
  };
}

const compile = (
  service: ReturnType<typeof createCompilationService>,
  generation: number,
  previous: ArtifactSnapshot | undefined,
  changes: FileChange[],
  context: CompilationContext = { lifetime: 'watch' },
) =>
  service.compile(
    { generation, mode: 'development', changes, ...(previous ? { previous } : {}) },
    new AbortController().signal,
    context,
  );

function success(result: CompilationResult): ArtifactSnapshot {
  expect(result.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
  expect(result.candidate).toBeDefined();
  return result.candidate!;
}

/** Everything a reader of the published site observes. */
function published(result: CompilationResult) {
  const candidate = success(result);
  const artifacts = [...candidate.artifacts].sort((left, right) => left.id.localeCompare(right.id));
  return {
    outputs: Object.fromEntries(
      artifacts
        .flatMap((artifact) => artifact.outputs)
        .map((output) => [output.path, output.content] as const)
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
    search: artifacts.map((artifact) => [artifact.id, artifact.searchRecords]),
    routes: artifacts.map((artifact) => [artifact.id, artifact.routes, artifact.apiList]),
    content: artifacts.map((artifact) => [
      artifact.id,
      artifact.content.map((item) => [item.ir.id, item.html, item.searchRecords]),
    ]),
    diagnostics: result.diagnostics,
  };
}

/** The union as the page of `variant` prints it. */
function printedUnion(result: CompilationResult, variant: Variant): string {
  const artifact = success(result).artifacts.find(
    (item) => item.identity.declarationId && item.routes[0]?.title === variant.page,
  )!;
  // The text of the page: a presentation's highlighting splits a union into tokens.
  const html = artifact.content.map((item) => item.html.replace(/<[^>]+>/g, '')).join('\n');
  const match = variant.union.exec(html);
  expect(match, `${variant.name}: the union of ${variant.page}`).not.toBeNull();
  return match![0];
}

/** The API page titles each compile renders. */
function renderedPages(): { take(snapshot: ArtifactSnapshot): string[] } {
  const compileContent = GeneratorContentCompiler.prototype.compile;
  let compiled: string[] = [];
  vi.spyOn(GeneratorContentCompiler.prototype, 'compile').mockImplementation(function (
    this: GeneratorContentCompiler,
    ...args: Parameters<typeof compileContent>
  ) {
    compiled.push(args[0].id);
    return compileContent.apply(this, args);
  });
  return {
    take: (snapshot) => {
      const owners = new Set(compiled.map((id) => id.split(':')[0]));
      compiled = [];
      return snapshot.artifacts
        .filter((artifact) => owners.has(artifact.id) && artifact.identity.declarationId)
        .map((artifact) => artifact.routes[0]?.title ?? artifact.id)
        .sort();
    },
  };
}

const SWITCHES = [
  'NGDOC_INCREMENTAL_PROGRAM',
  'NGDOC_SHAPE_CLOSURE',
  'NGDOC_SCOPED_SEMANTIC',
  'NGDOC_TARGETED_REBUILD',
] as const;

/** A development chain: a cold first generation, then the body edit. */
async function chain(
  f: Fixture,
  variant: Variant,
  env: Partial<Record<(typeof SWITCHES)[number], string>>,
  overrides: Partial<CompilationOptions> = {},
): Promise<{ results: CompilationResult[]; rendered: string[] }> {
  // The services read the switches when a compilation service creates them.
  for (const name of SWITCHES) vi.stubEnv(name, env[name] ?? '');
  const service = f.create(overrides);
  const spy = renderedPages();
  const first = await compile(service, 1, undefined, []);
  spy.take(success(first));
  const edited = await compile(service, 2, success(first), [
    f.edit(`src/${variant.edit.file}`, variant.edit.from, variant.edit.to),
  ]);
  const rendered = spy.take(success(edited));
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  return { results: [first, edited], rendered };
}

/** A cold build of the current tree: a fresh one-shot service, no previous snapshot. */
const cold = (f: Fixture) => compile(f.create(), 1, undefined, [], { lifetime: 'generation' });

test.each(variants)(
  'differential: $name print one union order on every path',
  async (variant) => {
    const f = fixture(variant);
    const on = await chain(f, variant, {});
    const colds = [await cold(f)];
    f.reset();
    colds.unshift(await cold(f));
    f.reset();
    const off = await chain(f, variant, {
      NGDOC_INCREMENTAL_PROGRAM: '0',
      NGDOC_SHAPE_CLOSURE: '0',
      NGDOC_SCOPED_SEMANTIC: '0',
      NGDOC_TARGETED_REBUILD: '0',
    });
    f.reset();
    const reference = await chain(f, variant, {}, { incrementalReuse: false });
    f.reset();
    const verify = await chain(f, variant, {
      NGDOC_SHAPE_CLOSURE: 'verify',
      NGDOC_SCOPED_SEMANTIC: 'verify',
    });
    // The edit re-rendered only these pages: the case this test is about.
    expect(on.rendered).toEqual(variant.rendered ?? [variant.page]);
    for (const index of [0, 1]) {
      const label = index ? 'edited' : 'initial';
      const expected = { label, ...published(colds[index]!) };
      expect({ label, ...published(on.results[index]!) }).toEqual(expected);
      expect({ label, ...published(off.results[index]!) }).toEqual(expected);
      expect({ label, ...published(reference.results[index]!) }).toEqual(expected);
      expect({ label, ...published(verify.results[index]!) }).toEqual(expected);
      expect(printedUnion(on.results[index]!, variant)).toBe(printedUnion(colds[index]!, variant));
      // Byte for byte: every revision, dependency, diagnostic and `whyRebuilt` reason.
      expect({ label, result: JSON.stringify(on.results[index]) }).toEqual({
        label,
        result: JSON.stringify(reference.results[index]),
      });
      const codes = verify.results[index]!.diagnostics.map((item) => item.code);
      expect(codes).not.toContain(SHAPE_CLOSURE_MISMATCH);
      expect(codes).not.toContain(SCOPED_SEMANTIC_MISMATCH);
    }
  },
  300_000,
);

// Playground options list the members of an input's union type. They follow the written order
// (`helpers/playground/written-union-order.ts`), never the checker's: `tone` is written
// `'soft' | 'link' | 'loud'`, while the checker orders literals by value (`'link'` first).
const playground: Variant = {
  name: 'playground options',
  sources: {
    'a.ts':
      "/** Links. */\nexport function linkOnly(): 'link' | 'primary' {\n  return 'link';\n}\n",
    'index.ts': "export * from './a';\n",
  },
  docs: {
    'play/ng-doc.page.ts':
      "import { Box } from './box'; const page = { title: 'Play', route: 'play', mdFile: './index.md', playgrounds: { Box: { target: Box, template: '<fixture-box></fixture-box>' } } }; export default page;",
    'play/index.md': '# Play\n\n{{ NgDocActions.playground("Box") }}\n',
    'play/color.ts':
      "export type Color = 'primary' | 'warning' | 'link';\nexport enum Size {\n  Medium = 'medium',\n  Small = 'small',\n}\n",
    'play/box.ts': [
      "import { Component, Input, input } from '@angular/core';",
      "import { Color, Size } from './color';",
      'type Wrapped<V> = { value: V };',
      'declare function unwrap<T>(x: { [K in keyof T]: Wrapped<T[K]> }): T;',
      'declare const either: boolean;',
      "@Component({ selector: 'fixture-box', template: '<b>box</b>' })",
      'export class Box {',
      // Reverse-mapped types that tie on every key but the type id: `q` is created first.
      "  /** Tied. */ @Input() tied = either ? unwrap({ q: { value: 's' } }) : unwrap({ p: { value: 1 } });",
      "  /** Color. */ @Input() color: Color = 'primary';",
      '  /** Size. */ @Input() size: Size = Size.Medium;',
      "  /** Tone. */ tone = input<'soft' | 'link' | 'loud'>('soft');",
      "  /** Optional. */ @Input() mode?: 'b' | 'a';",
      '  /** Flag. */ @Input() flag = false;',
      '}',
      '',
    ].join('\n'),
  },
  edit: { file: 'a.ts', from: "return 'link';", to: "return 'primary';" },
  page: 'linkOnly',
  union: /"link" \| "primary"|"primary" \| "link"/,
};

/** The option lists of the playground's inputs, as the published guide tab lists them. */
function playgroundOptions(result: CompilationResult): Record<string, unknown[]> {
  const html = success(result)
    .artifacts.flatMap((artifact) => artifact.content.map((item) => item.html))
    .join('\n')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  const options: Record<string, unknown[]> = {};
  // Each input: its name, then `"options":[...]` (quoted strings, or the label and value objects
  // of enum members).
  for (const [, name, list] of html.matchAll(
    /"(\w+)":\{"inputName":"\w+","type":"(?:[^"\\]|\\.)*","description":"(?:[^"\\]|\\.)*","options":\[((?:(?:"(?:[^"\\]|\\.)*"|\{[^{}]*\}),?)*)\]/g,
  ))
    options[name!] = JSON.parse(`[${list}]`);
  return options;
}

test('playground options follow the written order on every path', async () => {
  const f = fixture(playground);
  const on = await chain(f, playground, {});
  const colds = [await cold(f)];
  f.reset();
  colds.unshift(await cold(f));
  f.reset();
  const off = await chain(f, playground, {
    NGDOC_INCREMENTAL_PROGRAM: '0',
    NGDOC_SHAPE_CLOSURE: '0',
    NGDOC_SCOPED_SEMANTIC: '0',
    NGDOC_TARGETED_REBUILD: '0',
  });
  f.reset();
  const reference = await chain(f, playground, {}, { incrementalReuse: false });
  const expected = {
    color: ["'primary'", "'warning'", "'link'"],
    // Enum members: their names, and the values the checker resolved.
    size: [
      { label: 'Medium', value: 'medium' },
      { label: 'Small', value: 'small' },
    ],
    tone: ["'soft'", "'link'", "'loud'"],
    // `undefined` keeps the checker's position; the written members their written order.
    mode: ['undefined', "'b'", "'a'"],
    flag: ['false', 'true'],
    // No written type: the canonical order of printed types (by text), not the creation order.
    tied: ['{ p: number; }', '{ q: string; }'],
  };
  for (const index of [0, 1]) {
    const label = index ? 'edited' : 'initial';
    for (const result of [on, off, reference]
      .map((item) => item.results[index]!)
      .concat(colds[index]!))
      expect({ label, options: playgroundOptions(result) }).toEqual({ label, options: expected });
    const reference_ = { label, ...published(colds[index]!) };
    expect({ label, ...published(on.results[index]!) }).toEqual(reference_);
    expect({ label, ...published(off.results[index]!) }).toEqual(reference_);
    expect({ label, ...published(reference.results[index]!) }).toEqual(reference_);
  }
  // API text keeps the checker's order, by value, which is not the written one.
  expect(printedUnion(colds[0]!, playground)).toBe('"link" | "primary"');
}, 300_000);

// A fragment that names a declaration outside the program adds its file, which re-creates the
// program (and its checker) in the middle of a generation; the API pages rendered after it must
// print what a generation that never adds it prints.
test('a fragment outside the program leaves every union order as a cold build prints it', async () => {
  // Library symbols are ordered by the program's file order too; re-creating the program from
  // every cached file would move the library files.
  const variant: Variant = {
    name: 'a fragment outside the program',
    sources: {
      'a.ts': 'export interface Alpha {\n  a: 1;\n}\n',
      'b.ts': 'export interface Beta {\n  b: 1;\n}\n',
      'emit.ts': [
        "import type { ElementRef, EventEmitter, Injector, Type } from '@angular/core';",
        "import type { Observable, Subject } from 'rxjs';",
        "import type { Alpha } from './a';",
        "import type { Beta } from './b';",
        '/** Emits. */',
        'export function emit(): Beta | Alpha {',
        '  return { a: 1 };',
        '}',
        '/** Libraries. */',
        'export function libraries(): Subject<1> | Injector | Observable<1> | EventEmitter<1> | ElementRef | Type<1> | Promise<1> | Map<1, 1> {',
        '  return new Map();',
        '}',
        '',
      ].join('\n'),
      'index.ts': "export * from './emit';\n",
    },
    docs: {
      'guide/ng-doc.page.ts':
        "const page = { title: 'Guide', route: 'guide', mdFile: './index.md' }; export default page;",
      'guide/index.md': '# Guide\n\n{{ NgDocApi.api("extra/outside.ts#outside") }}\n',
    },
    edit: { file: 'emit.ts', from: 'return new Map();', to: 'return new Map([]);' },
    page: 'libraries',
    union: /Subject(&#x3C;|<)1> \| [^<]*/,
  };
  const f = fixture(variant);
  const outside = path.join(f.root, 'extra/outside.ts');
  mkdirSync(path.dirname(outside), { recursive: true });
  writeFileSync(
    outside,
    "import type { Signal } from '@angular/core';\nimport type { Alpha } from '../src/a';\n/** Outside. */\nexport function outside(): Signal<1> | Alpha {\n  return null!;\n}\n",
  );
  const on = await chain(f, variant, {});
  f.reset();
  const off = await chain(f, variant, { NGDOC_TARGETED_REBUILD: '0' });
  const edited = await cold(f);
  f.reset();
  const initial = await cold(f);
  expect(on.rendered).toEqual(['emit', 'libraries']);
  for (const [index, expected] of [initial, edited].entries()) {
    expect(published(on.results[index]!)).toEqual(published(expected));
    expect(JSON.stringify(on.results[index])).toBe(JSON.stringify(off.results[index]));
  }
  expect(JSON.stringify(published(edited).content)).toContain('outside');
}, 300_000);

// A fragment that names a declaration outside the program re-creates the program, and its
// checker, in the middle of its query: the new checker prints in the canonical order too, so two
// guides print the same declaration alike (and as an API page of the program would).
test('two guides that document a declaration outside the program print one union order', async () => {
  const guide = (title: string) =>
    `const page = { title: '${title}', route: '${title.toLowerCase()}', mdFile: './index.md' }; export default page;`;
  const variant: Variant = {
    name: 'two guides',
    sources: { 'index.ts': 'export const placeholder = 1;\n' },
    docs: {
      'first/ng-doc.page.ts': guide('First'),
      'first/index.md': '# First\n\n{{ NgDocApi.api("extra/outside.ts#outside") }}\n',
      'second/ng-doc.page.ts': guide('Second'),
      'second/index.md': '# Second\n\n{{ NgDocApi.api("extra/outside.ts#outside") }}\n',
    },
    extra: {
      'extra/outside.ts': [
        'type Box<V> = { value: V };',
        'declare function unbox<T>(x: { [K in keyof T]: Box<T[K]> }): T;',
        'declare const flag: boolean;',
        "const zeta = unbox({ q: { value: 's' } });",
        'const alpha = unbox({ p: { value: 1 } });',
        '/** Outside. */',
        'export const outside = flag ? zeta : alpha;',
        '',
      ].join('\n'),
    },
    edit: { file: 'index.ts', from: '1', to: '2' },
    page: 'outside',
    union: /\{ [pq]: \w+;? \} \| \{ [pq]: \w+;? \}/,
  };
  const f = fixture(variant);
  const result = await cold(f);
  // Every union each guide prints (presentation and type cells): `p` first, as the canonical order.
  const printed = success(result)
    .artifacts.filter((artifact) => ['First', 'Second'].includes(artifact.routes[0]?.title ?? ''))
    .map((artifact) => {
      const html = artifact.content.map((item) => item.html.replace(/<[^>]+>/g, '')).join('\n');
      return [...html.matchAll(/\{ ([pq]): \w+;? \} \| \{ ([pq]): \w+;? \}/g)].map(
        ([, first, second]) => `${first}|${second}`,
      );
    });
  expect(printed).toHaveLength(2);
  expect(printed[0]!.length).toBeGreaterThan(0);
  expect(printed[1]).toEqual(printed[0]);
  expect(new Set(printed.flat())).toEqual(new Set(['p|q']));
}, 300_000);
