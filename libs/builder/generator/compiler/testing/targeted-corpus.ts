import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect } from 'vitest';

import type { ArtifactSnapshot, CompilationResult, FileChange } from '../../contracts';
import { type CompilationOptions, createCompilationService } from '../index';

/**
 * The targeted rebuild's edit corpora (shared by `dry-run.vitest.ts` and the
 * `incremental-*.vitest.ts` suites): a small documentation fixture with a guide that has a demo, a
 * page with a playground, a page
 * whose template reads its data, a keyword consumer, a nested shared include and an API entry; a
 * fixed corpus of edit kinds, each designated content (the targeted path must compile it) or full;
 * and a seeded random edit sequence over the same kinds.
 */

/** Disposers the test file runs after each test. */
export const cleanup: Array<() => unknown> = [];

export interface Fixture {
  root: string;
  path(file: string): string;
  read(file: string): string;
  write(file: string, content: string): string;
  remove(file: string): string;
  reset(): void;
  initial: Record<string, string>;
  create(overrides?: Partial<CompilationOptions>): ReturnType<typeof createCompilationService>;
}

export const page = (title: string, route: string, extra = '') =>
  `const page = { title: '${title}', route: '${route}', mdFile: './index.md'${extra} }; export default page;`;

/** The playground page: its playground template is not part of the page's evaluated value. */
export const playPage = (template: string) =>
  `import { Box } from './box'; ${page('Play', 'play', `, playgrounds: { Box: { target: Box, template: '${template}' } }`)}`;

/**
 * The playground's target component, with inputs the playground offers as controls; the type of
 * one of them is declared in another file (`size.ts`), which only the type closure reaches.
 */
export const boxComponent = (label: string) =>
  `import { Component, Input } from '@angular/core'; import type { Size } from './size'; /** ${label} component. */ @Component({ selector: 'fixture-box', template: '<b>box</b>' }) export class Box { /** The ${label.toLowerCase()} label. */ @Input() label = '${label}'; /** The size. */ @Input() size: Size = 'small'; }`;

export const sizeType = (sizes: string[]) =>
  `export type Size = ${sizes.map((size) => `'${size}'`).join(' | ')};`;

/** A page whose template reads `NgDocPage.data`. */
export const dataPage = (version: number) =>
  page('Data', 'data', `, data: { version: ${version} }`);

/** A category module (`extra`: more fields). */
export const category = (title: string, route: string, extra = '') =>
  `const category = { title: '${title}', route: '${route}'${extra} }; export default category;`;

/** A page in the category its module imports from `from`. */
export const categorizedPage = (title: string, route: string, from: string) =>
  `import Category from '${from}'; ${page(title, route, ', category: Category')}`;

/**
 * A declaration a guide embeds live, outside the API scope (it is in the program through the
 * tsconfig glob): its summary names the widget, and the member's type is `size`.
 * @param name The name its documentation uses.
 * @param size The type of its `size` member and of its method's parameter.
 */
export const embeddedWidget = (name: string, size: string) =>
  `/** The ${name.toLowerCase()} summary. */ export class Widget { /** The ${name} size. */ size?: ${size}; /** Resizes the ${name.toLowerCase()}. */ resize(size: ${size}): void {} }`;

/** The guide that embeds `docs/embed/widget.ts#Widget` with every live API action. */
export const EMBED_GUIDE = [
  '# Embed',
  '',
  '{{ JSDoc.description("docs/embed/widget.ts#Widget") }}',
  '',
  '{{ NgDocApi.details("docs/embed/widget.ts#Widget") }}',
  '',
  '{{ NgDocApi.api("docs/embed/widget.ts#Widget") }}',
  '',
].join('\n');

/** An API file of the fixture's scope (`docs/api*.ts`). */
export const apiExtra = (summary: string) =>
  `/** ${summary}. */ export class Extra { /** Count. */ count = 1; }`;

export function fixture(
  cache: boolean = false,
  defaults: Partial<CompilationOptions> = {},
  extra: (root: string) => Record<string, string> = () => ({}),
): Fixture {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'ngdoc-dry-run-')));
  cleanup.push(() => rmSync(root, { recursive: true, force: true }));
  symlinkSync(
    path.resolve(import.meta.dirname, '../../../../../node_modules'),
    path.join(root, 'node_modules'),
    'dir',
  );
  const initial: Record<string, string> = {
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        types: [],
        skipLibCheck: true,
        experimentalDecorators: true,
      },
      include: ['docs/**/*.ts'],
    }),
    'ng-doc.config.ts': `export default { docsPath: 'docs', cache: ${cache} };`,
    'docs/ng-doc.api.ts': `const api = { title: 'API', keyword: 'ApiIndex', scopes: [{ name: 'Public', route: 'public', include: ['docs/api*.ts'] }] }; export default api;`,
    // The API page links to the guide, so a replayed API unit is a one-hop consumer of its key.
    'docs/api.ts':
      '/** Actual declaration, see `*Guide`. */ export class Actual { /** Value. */ value = 1; }',
    'docs/guide/ng-doc.page.ts': `import { Demo } from './demo'; /** Guide introduction. */ ${page('Guide', 'guide', ', demos: { Demo }')}`,
    'docs/guide/index.md': `---\nkeyword: Guide\n---\n# Guide heading\n\nBody with \`Actual\`.\n\n{% include "../shared/include.md" %}\n\n{{ NgDocActions.demo("Demo") }}\n`,
    'docs/guide/demo.ts': `import { Component } from '@angular/core'; @Component({ selector: 'fixture-demo', templateUrl: './demo.html', styleUrls: ['./demo.scss'] }) export class Demo {}`,
    'docs/guide/demo.html': '<b>External demo body</b>',
    'docs/guide/demo.scss': 'b { color: red; }',
    'docs/second/ng-doc.page.ts': page('Second', 'second'),
    'docs/second/index.md': `# Second\n\nSee \`*Guide\` for details.\n\n{% include "../shared/include.md" %}\n`,
    'docs/third/ng-doc.page.ts': page('Third', 'third'),
    'docs/third/index.md': '# Third\n\nPlain prose only.\n',
    'docs/fourth/ng-doc.page.ts': page('Fourth', 'fourth'),
    'docs/fourth/index.md': '# Fourth\n\nNothing yet.\n',
    'docs/shared/include.md': 'Shared include text.\n\n{% include "./nested.md" %}\n',
    'docs/shared/nested.md': 'Nested include text.',
    // A playground whose target is a component of its own file, and a page whose template reads
    // its data.
    'docs/play/ng-doc.page.ts': playPage('<fixture-box></fixture-box>'),
    'docs/play/index.md': '# Play\n\n{{ NgDocActions.playground("Box") }}\n',
    'docs/play/box.ts': boxComponent('Box'),
    'docs/play/size.ts': sizeType(['small', 'large']),
    'docs/data/ng-doc.page.ts': dataPage(1),
    'docs/data/index.md': '# Data\n\nVersion {{ NgDocPage.data.version }}.\n',
    ...extra(root),
  };
  const resolve = (file: string) => path.join(root, file);
  const write = (file: string, content: string) => {
    const target = resolve(file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
    return target;
  };
  const reset = () => {
    for (const directory of ['docs', 'out', 'cache'])
      rmSync(resolve(directory), { recursive: true, force: true });
    for (const [file, content] of Object.entries(initial)) write(file, content);
  };
  reset();
  const options: CompilationOptions = {
    projectId: 'fixture',
    workspaceRoot: root,
    configFile: resolve('ng-doc.config.ts'),
    defaults: {
      docsRoot: resolve('docs'),
      tsConfig: resolve('tsconfig.json'),
      outputRoot: resolve('out'),
      cacheRoot: resolve('cache'),
    },
    compilerVersion: 'test-v1',
    toolchainDigest: 'real-ts6-shiki',
  };
  return {
    root,
    initial,
    path: resolve,
    read: (file) => readFileSync(resolve(file), 'utf8'),
    write,
    remove: (file) => {
      const target = resolve(file);
      unlinkSync(target);
      return target;
    },
    reset,
    create: (overrides = {}) => {
      const service = createCompilationService({ ...options, ...defaults, ...overrides });
      cleanup.push(() => service.dispose());
      return service;
    },
  };
}

/** One watch generation, as the session sends it: a filesystem batch against the committed base. */
export const generation = (
  service: ReturnType<typeof createCompilationService>,
  number: number,
  previous: ArtifactSnapshot | undefined,
  changes: FileChange[],
) =>
  service.compile(
    {
      generation: number,
      mode: 'development',
      changes,
      ...(previous ? { previous, contentRequest: { origin: 'filesystem' as const } } : {}),
    },
    new AbortController().signal,
    { lifetime: 'watch' },
  );

export const update = (file: string): FileChange => ({ kind: 'update', path: file });
/** Files written just before a generation settle past the retained program's stat margin. */
export const settle = () => new Promise((resolve) => setTimeout(resolve, 60));

export function candidate(result: CompilationResult, label: string): ArtifactSnapshot {
  expect(
    result.diagnostics.filter((item) => item.severity === 'error'),
    label,
  ).toEqual([]);
  expect(result.candidate, label).toBeDefined();
  return result.candidate!;
}

export interface Step {
  name: string;
  /**
   * The class the dry run must predict. A `content` step predicted FULL fails too: otherwise a
   * FULL-versus-FULL comparison would count as coverage of the targeted path.
   */
  expect: 'content' | 'full';
  /**
   * The error code the generation fails with, when it must fail (it then commits nothing, and the
   * next step compiles against the same base).
   */
  fails?: string;
  apply(f: Fixture): FileChange[];
}

export const append = (f: Fixture, file: string, text: string) =>
  update(f.write(file, f.read(file) + text));

/** Atomic save (WebStorm safe-write): the new bytes are renamed over the file. */
export function atomicSave(f: Fixture, file: string, text: string): string {
  const target = f.path(file);
  writeFileSync(`${target}___jb_tmp___`, text);
  renameSync(target, `${target}___jb_old___`);
  renameSync(`${target}___jb_tmp___`, target);
  unlinkSync(`${target}___jb_old___`);
  return target;
}

export const corpus: Step[] = [
  {
    name: 'guide body edit',
    expect: 'content',
    apply: (f) => [append(f, 'docs/guide/index.md', '\nEdited.\n')],
  },
  {
    name: 'include edit',
    expect: 'content',
    apply: (f) => [
      update(f.write('docs/shared/include.md', 'Edited include.\n\n{% include "./nested.md" %}\n')),
    ],
  },
  {
    name: 'nested include edit',
    expect: 'content',
    apply: (f) => [update(f.write('docs/shared/nested.md', 'Edited nested include.'))],
  },
  {
    name: 'tab route and title (front matter)',
    expect: 'content',
    apply: (f) => [
      update(
        f.write(
          'docs/guide/index.md',
          f
            .read('docs/guide/index.md')
            .replace('keyword: Guide', 'keyword: Guide\nroute: intro\ntitle: Intro'),
        ),
      ),
    ],
  },
  {
    name: 'tab title rename that changes link text on another page',
    expect: 'content',
    apply: (f) => [
      update(
        f.write(
          'docs/guide/index.md',
          f.read('docs/guide/index.md').replace('title: Intro', 'title: Introduction'),
        ),
      ),
    ],
  },
  {
    name: 'heading rename',
    expect: 'content',
    apply: (f) => [
      update(
        f.write(
          'docs/guide/index.md',
          f.read('docs/guide/index.md').replace('# Guide heading', '# Renamed heading'),
        ),
      ),
    ],
  },
  {
    name: 'keyword add',
    expect: 'content',
    apply: (f) => [
      update(
        f.write(
          'docs/third/index.md',
          `---\nkeyword: Third\n---\n${f.initial['docs/third/index.md']}`,
        ),
      ),
    ],
  },
  {
    name: 'keyword consumer add',
    expect: 'content',
    apply: (f) => [update(f.write('docs/fourth/index.md', '# Fourth\n\nSee `*Third`.\n'))],
  },
  {
    name: 'keyword consumer remove',
    expect: 'content',
    apply: (f) => [update(f.write('docs/fourth/index.md', f.initial['docs/fourth/index.md']))],
  },
  {
    name: 'keyword remove',
    expect: 'content',
    apply: (f) => [update(f.write('docs/third/index.md', f.initial['docs/third/index.md']))],
  },
  {
    name: 'demo template edit',
    expect: 'content',
    apply: (f) => [update(f.write('docs/guide/demo.html', '<b>Edited demo body</b>'))],
  },
  {
    name: 'demo style edit',
    expect: 'content',
    apply: (f) => [update(f.write('docs/guide/demo.scss', 'b { color: blue; }'))],
  },
  {
    name: 'new include (the new file is not reported: unrecorded)',
    expect: 'content',
    apply: (f) => {
      f.write('docs/shared/fresh.md', 'A fresh include.');
      return [append(f, 'docs/third/index.md', '\n{% include "../shared/fresh.md" %}\n')];
    },
  },
  {
    name: 'atomic safe-write, delete batch',
    expect: 'content',
    apply: (f) => [
      {
        kind: 'delete',
        path: atomicSave(
          f,
          'docs/second/index.md',
          f.read('docs/second/index.md') + '\nSafe write.\n',
        ),
      },
    ],
  },
  {
    name: 'atomic safe-write, create batch',
    expect: 'content',
    apply: (f) => [{ kind: 'create', path: f.path('docs/second/index.md') }],
  },
  {
    name: 'touch (same bytes)',
    expect: 'content',
    apply: (f) => [update(f.write('docs/third/index.md', f.read('docs/third/index.md')))],
  },
  {
    name: 'demo .ts edit',
    expect: 'content',
    apply: (f) => [
      update(
        f.write(
          'docs/guide/demo.ts',
          f.read('docs/guide/demo.ts').replace("'fixture-demo'", "'fixture-demo-2'"),
        ),
      ),
    ],
  },
  {
    name: 'API JSDoc edit',
    expect: 'content',
    apply: (f) => [
      update(
        f.write(
          'docs/api.ts',
          '/** Edited declaration. */ export class Actual { /** Value. */ value = 1; }',
        ),
      ),
    ],
  },
  {
    name: 'page title edit (entry module)',
    expect: 'content',
    apply: (f) => [update(f.write('docs/third/ng-doc.page.ts', page('Third Renamed', 'third')))],
  },
  {
    name: 'page data edit read by its template',
    expect: 'content',
    apply: (f) => [update(f.write('docs/data/ng-doc.page.ts', dataPage(2)))],
  },
  {
    name: 'playground template edit',
    expect: 'content',
    apply: (f) => [
      update(
        f.write('docs/play/ng-doc.page.ts', playPage('<fixture-box label="x"></fixture-box>')),
      ),
    ],
  },
  {
    name: 'playground target component edit',
    expect: 'content',
    apply: (f) => [update(f.write('docs/play/box.ts', boxComponent('Crate')))],
  },
  {
    name: 'playground input type edit in another file',
    expect: 'content',
    apply: (f) => [update(f.write('docs/play/size.ts', sizeType(['small', 'medium', 'large'])))],
  },
  {
    // The new file joins the program without an event of its own (a tsconfig glob member).
    name: 'demo .ts edit that imports a new file',
    expect: 'content',
    apply: (f) => {
      f.write('docs/guide/helper.ts', `export const selector = 'fixture-helper';\n`);
      return [
        update(
          f.write(
            'docs/guide/demo.ts',
            `import { selector } from './helper'; ${f.read('docs/guide/demo.ts')} export const alias = selector;`,
          ),
        ),
      ];
    },
  },
  {
    name: 'edit of the file the demo imports since the last generation',
    expect: 'content',
    apply: (f) => [
      update(f.write('docs/guide/helper.ts', `export const selector = 'fixture-helper-2';\n`)),
    ],
  },
  {
    name: 'demo .ts edit and a page title edit together',
    expect: 'content',
    apply: (f) => [
      update(
        f.write(
          'docs/guide/demo.ts',
          f.read('docs/guide/demo.ts').replace("'fixture-demo-2'", "'fixture-demo-3'"),
        ),
      ),
      update(f.write('docs/fourth/ng-doc.page.ts', page('Fourth Renamed', 'fourth'))),
    ],
  },
  {
    name: 'page add',
    expect: 'content',
    apply: (f) => [
      { kind: 'create', path: f.write('docs/fifth/ng-doc.page.ts', page('Fifth', 'fifth')) },
      { kind: 'create', path: f.write('docs/fifth/index.md', '# Fifth\n') },
    ],
  },
  {
    name: 'page rename (folder move)',
    expect: 'content',
    apply: (f) => {
      renameSync(f.path('docs/fifth'), f.path('docs/sixth'));
      return [
        { kind: 'delete', path: f.path('docs/fifth') },
        { kind: 'create', path: f.path('docs/sixth') },
      ];
    },
  },
  {
    name: 'page delete',
    expect: 'content',
    apply: (f) => [
      { kind: 'delete', path: f.remove('docs/sixth/index.md') },
      { kind: 'delete', path: f.remove('docs/sixth/ng-doc.page.ts') },
    ],
  },
  // The structural class: categories, API files and API entries that come and go, and pages that
  // move between categories. Every step is targeted: the entry diff, the program's root change and
  // the API enumeration diff describe only what they touch; the navigation is aggregated in full.
  {
    name: 'category add',
    expect: 'content',
    apply: (f) => [
      {
        kind: 'create',
        path: f.write('docs/group/ng-doc.category.ts', category('Group', 'group')),
      },
    ],
  },
  {
    name: 'page moved into a category (its module imports the category)',
    // The import loads the category module before the files between the two in the program:
    // loaded files swap places, which may reorder any union (`stableTypeOrdering`), so every
    // closure refreshes as changed and the generation is the full one.
    expect: 'full',
    apply: (f) => [
      update(
        f.write(
          'docs/fourth/ng-doc.page.ts',
          categorizedPage('Fourth', 'fourth', '../group/ng-doc.category'),
        ),
      ),
    ],
  },
  {
    name: "category title and order edit (its page's breadcrumbs)",
    expect: 'content',
    apply: (f) => [
      update(
        f.write('docs/group/ng-doc.category.ts', category('Group Renamed', 'group', ', order: 2')),
      ),
    ],
  },
  {
    name: 'page moved to another, new category',
    // The old category module is no longer loaded through the page: it moves past the files
    // between the two, a file-order swap (see above), and the generation is the full one.
    expect: 'full',
    apply: (f) => [
      {
        kind: 'create',
        path: f.write('docs/other/ng-doc.category.ts', category('Other', 'other')),
      },
      update(
        f.write(
          'docs/fourth/ng-doc.page.ts',
          categorizedPage('Fourth', 'fourth', '../other/ng-doc.category'),
        ),
      ),
    ],
  },
  {
    name: 'categories removed, the page back at the root',
    expect: 'content',
    apply: (f) => [
      update(f.write('docs/fourth/ng-doc.page.ts', page('Fourth', 'fourth'))),
      { kind: 'delete', path: f.remove('docs/group/ng-doc.category.ts') },
      { kind: 'delete', path: f.remove('docs/other/ng-doc.category.ts') },
    ],
  },
  {
    // Inline code no keyword binds yet: the API file below binds it (and its delete unbinds it).
    name: 'inline code a later API export binds',
    expect: 'content',
    apply: (f) => [append(f, 'docs/fourth/index.md', '\nSee `Extra`.\n')],
  },
  {
    name: 'new API file joins a scope',
    expect: 'content',
    apply: (f) => [
      { kind: 'create', path: f.write('docs/api-extra.ts', apiExtra('Extra summary')) },
    ],
  },
  {
    name: 'an export added to the new API file',
    expect: 'content',
    apply: (f) => [
      update(
        f.write(
          'docs/api-extra.ts',
          `${apiExtra('Extra summary')}\n/** Second extra. */ export function extraHelper(): number { return 1; }\n`,
        ),
      ),
    ],
  },
  {
    // The derived-class list of the extended class's page (its Extended by list) changes, though
    // that page's own file does not. The new import reaches every unit of this small fixture, so
    // the change exceeds the dirty threshold and the generation is the full one.
    name: 'a class in another API file starts extending an API class',
    expect: 'full',
    apply: (f) => [
      update(
        f.write(
          'docs/api-extra.ts',
          `import { Actual } from './api';\n/** Extra summary. */ export class Extra extends Actual { /** Count. */ count = 1; }\n/** Second extra. */ export function extraHelper(): number { return 1; }\n`,
        ),
      ),
    ],
  },
  {
    name: 'the class stops extending it',
    expect: 'content',
    apply: (f) => [
      update(
        f.write(
          'docs/api-extra.ts',
          `import { Actual } from './api';\n${apiExtra('Extra summary')}\n/** Second extra. */ export function extraHelper(): number { return Actual.name.length; }\n`,
        ),
      ),
    ],
  },
  {
    name: 'API file delete',
    expect: 'content',
    apply: (f) => [{ kind: 'delete', path: f.remove('docs/api-extra.ts') }],
  },
  {
    name: 'API entry add (a new API page with its own scope)',
    expect: 'content',
    apply: (f) => [
      {
        kind: 'create',
        path: f.write(
          'docs/more/lib.ts',
          '/** More thing. */ export class MoreThing { /** Size. */ size = 2; }',
        ),
      },
      {
        kind: 'create',
        path: f.write(
          'docs/more/ng-doc.api.ts',
          `const api = { title: 'More API', keyword: 'MoreIndex', route: 'more-api', scopes: [{ name: 'More', route: 'more', include: ['docs/more/lib*.ts'] }] }; export default api;`,
        ),
      },
    ],
  },
  {
    name: 'API entry remove',
    expect: 'content',
    apply: (f) => [
      { kind: 'delete', path: f.remove('docs/more/ng-doc.api.ts') },
      { kind: 'delete', path: f.remove('docs/more/lib.ts') },
    ],
  },
  // The keyword diff of units that come and go: a new page exports a key another guide already
  // links (the last export wins), and its delete gives the key back; a same-name export in a second
  // scope file takes an existing declaration's route and key (disambiguation), then leaves.
  {
    name: 'page added with a keyword another guide links',
    expect: 'content',
    apply: (f) => [
      {
        kind: 'create',
        path: f.write('docs/zeta/index.md', '---\nkeyword: Guide\n---\n# Zeta\n\nSee `*Guide`.\n'),
      },
      { kind: 'create', path: f.write('docs/zeta/ng-doc.page.ts', page('Zeta', 'zeta')) },
    ],
  },
  {
    name: 'the page with the linked keyword is deleted',
    expect: 'content',
    apply: (f) => {
      rmSync(f.path('docs/zeta'), { recursive: true });
      return [{ kind: 'delete', path: f.path('docs/zeta') }];
    },
  },
  {
    name: 'a same-name export in a second scope file disambiguates the existing declaration',
    expect: 'content',
    apply: (f) => [
      {
        kind: 'create',
        path: f.write(
          'docs/apiz.ts',
          '/** Twin declaration. */ export class Actual { /** Twin. */ twin = 2; }',
        ),
      },
    ],
  },
  {
    name: 'the same-name export leaves the scope',
    expect: 'content',
    apply: (f) => [{ kind: 'delete', path: f.remove('docs/apiz.ts') }],
  },
  {
    // A barrel-only scope file re-exports a module outside the scope glob; a guide links the
    // declaration. Removing the re-export drops the declaration's unit, which recorded only its
    // own module: no path reaches it, only the enumeration diff does.
    name: 'a barrel scope file re-exports a declaration a guide links',
    expect: 'content',
    apply: (f) => {
      f.write(
        'docs/lib/star.ts',
        '/** Star thing, a `StarThing`. */ export class StarThing { /** Size. */ size = 3; }',
      );
      return [
        { kind: 'create', path: f.write('docs/api-barrel.ts', "export * from './lib/star';\n") },
        append(f, 'docs/third/index.md', '\nSee `StarThing`.\n'),
      ];
    },
  },
  {
    name: 'the barrel drops the import and re-export',
    // The module is no longer loaded through the barrel: it moves past the files between the
    // two, a file-order swap (see above), and the generation is the full one.
    expect: 'full',
    apply: (f) => [update(f.write('docs/api-barrel.ts', 'export {};\n'))],
  },
  {
    name: 'the barrel re-exports the module again',
    // The module is loaded through the barrel again: its files come back, an insertion.
    expect: 'content',
    apply: (f) => [update(f.write('docs/api-barrel.ts', "export * from './lib/star';\n"))],
  },
  {
    name: 'the barrel drops the re-export',
    expect: 'content',
    // The barrel still loads the module, so no loaded file moves in the program.
    apply: (f) => [update(f.write('docs/api-barrel.ts', "import './lib/star';\nexport {};\n"))],
  },
  // Live API embeds in a guide (`NgDocApi.api`, `NgDocApi.details`, `JSDoc.description`): the
  // guide records what its fragments read, so an edit of the embedded declaration re-renders it.
  {
    name: 'guide with live API embeds added',
    expect: 'content',
    apply: (f) => [
      { kind: 'create', path: f.write('docs/embed/widget.ts', embeddedWidget('Widget', 'number')) },
      { kind: 'create', path: f.write('docs/embed/ng-doc.page.ts', page('Embed', 'embed')) },
      { kind: 'create', path: f.write('docs/embed/index.md', EMBED_GUIDE) },
    ],
  },
  {
    name: 'embedded declaration JSDoc edit',
    expect: 'content',
    apply: (f) => [update(f.write('docs/embed/widget.ts', embeddedWidget('Gadget', 'number')))],
  },
  {
    name: 'embedded declaration member type edit',
    expect: 'content',
    apply: (f) => [
      update(f.write('docs/embed/widget.ts', embeddedWidget('Gadget', "'small' | 'large'"))),
    ],
  },
  // The embedded declaration through a re-export, renamed, deleted and back: a guide that embeds
  // a declaration that no longer resolves fails, and one that resolves again renders again.
  {
    name: 'guide embedding through a re-export added',
    // The new barrel reaches every unit of this small fixture: over the dirty threshold.
    expect: 'full',
    apply: (f) => [
      {
        kind: 'create',
        path: f.write('docs/embed/barrel.ts', "export { Widget } from './widget';\n"),
      },
      { kind: 'create', path: f.write('docs/embed2/ng-doc.page.ts', page('Embed2', 'embed2')) },
      {
        kind: 'create',
        path: f.write(
          'docs/embed2/index.md',
          '# Embed2\n\n{{ JSDoc.description("docs/embed/barrel.ts#Widget") }}\n\n' +
            '{{ NgDocApi.api("docs/embed/barrel.ts#Widget") }}\n',
        ),
      },
    ],
  },
  {
    name: 'embedded declaration edited behind a re-export',
    expect: 'content',
    apply: (f) => [update(f.write('docs/embed/widget.ts', embeddedWidget('Sprocket', 'string')))],
  },
  {
    name: 'embedded declaration renamed',
    expect: 'full',
    fails: 'SEMANTIC_DECLARATION_MISSING',
    apply: (f) => [
      update(
        f.write(
          'docs/embed/widget.ts',
          embeddedWidget('Sprocket', 'string').replace('class Widget', 'class Gizmo'),
        ),
      ),
    ],
  },
  {
    name: 'embedded declaration restored',
    expect: 'full',
    apply: (f) => [update(f.write('docs/embed/widget.ts', embeddedWidget('Cog', 'string')))],
  },
  {
    name: 'embedded file deleted',
    expect: 'full',
    fails: 'SEMANTIC_DECLARATION_MISSING',
    apply: (f) => [{ kind: 'delete', path: f.remove('docs/embed/widget.ts') }],
  },
  {
    name: 'embedded file recreated',
    expect: 'full',
    apply: (f) => [
      { kind: 'create', path: f.write('docs/embed/widget.ts', embeddedWidget('Wheel', 'string')) },
    ],
  },
  {
    name: 'config edit',
    expect: 'full',
    apply: (f) => [
      update(
        f.write(
          'ng-doc.config.ts',
          `export default { docsPath: 'docs', cache: false, guide: { anchorHeadings: ['h1', 'h2'] } };`,
        ),
      ),
    ],
  },
  {
    name: 'tsconfig edit',
    expect: 'full',
    apply: (f) => [
      update(f.write('tsconfig.json', f.read('tsconfig.json').replace('"ES2022"', '"ES2023"'))),
    ],
  },
  {
    name: 'unknown path',
    expect: 'full',
    apply: (f) => [{ kind: 'create', path: f.write('notes.txt', 'unrelated') }],
  },
];

/** Mulberry32: a small seeded PRNG, so the sequences are fixed per seed. */
export function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The seeded random edit sequence: the kinds of the corpus (md bodies, includes, front matter,
 * headings, keyword and consumer toggles, demo template and style, reverts, touches, safe writes in
 * separate batches, new includes, page module, page data, demo `.ts` and playground edits) and
 * occasional API edits, which must go FULL.
 */
export function seededSteps(seed: number, count: number): Step[] {
  const next = random(seed);
  const pick = <T>(values: T[]): T => values[Math.floor(next() * values.length)];
  const state = {
    thirdKeyword: false,
    fourthUses: false,
    fresh: 0,
    pending: undefined as string | undefined,
  };
  const word = () => pick(['alpha', 'beta', 'gamma', 'delta', 'omega']) + Math.floor(next() * 1000);
  const guides = [
    'docs/guide/index.md',
    'docs/second/index.md',
    'docs/third/index.md',
    'docs/fourth/index.md',
  ];
  const steps: Step[] = [];
  const kinds: Array<[number, () => Step]> = [
    [
      6,
      () => {
        const file = pick(guides);
        return {
          name: `body ${file}`,
          expect: 'content',
          apply: (f) => [append(f, file, `\n${word()}.\n`)],
        };
      },
    ],
    [
      3,
      () => ({
        name: 'include',
        expect: 'content',
        apply: (f) => [
          update(
            f.write(
              'docs/shared/include.md',
              `Include ${word()}.\n\n{% include "./nested.md" %}\n`,
            ),
          ),
        ],
      }),
    ],
    [
      2,
      () => ({
        name: 'nested include',
        expect: 'content',
        apply: (f) => [update(f.write('docs/shared/nested.md', `Nested ${word()}.`))],
      }),
    ],
    [
      2,
      () => {
        const title = pick(['Guide', 'Guide Renamed', 'Guide Other']);
        return {
          name: `guide title ${title}`,
          expect: 'content',
          apply: (f) => [
            update(
              f.write(
                'docs/guide/index.md',
                f
                  .read('docs/guide/index.md')
                  .replace(
                    /^---\n[\s\S]*?\n---\n/,
                    `---\nkeyword: Guide\nroute: intro\ntitle: ${title}\n---\n`,
                  ),
              ),
            ),
          ],
        };
      },
    ],
    [
      2,
      () => {
        const heading = pick(['Guide heading', 'Renamed heading', 'Other heading']);
        return {
          name: `heading ${heading}`,
          expect: 'content',
          apply: (f) => [
            update(
              f.write(
                'docs/guide/index.md',
                f.read('docs/guide/index.md').replace(/^# .*$/m, `# ${heading}`),
              ),
            ),
          ],
        };
      },
    ],
    [
      2,
      () => {
        if (state.fourthUses) {
          state.fourthUses = false;
          return {
            name: 'consumer remove',
            expect: 'content',
            apply: (f) => [
              update(
                f.write(
                  'docs/fourth/index.md',
                  f.read('docs/fourth/index.md').replace('\nSee `*Third`.\n', '\n'),
                ),
              ),
            ],
          };
        }
        if (state.thirdKeyword) {
          state.fourthUses = true;
          return {
            name: 'consumer add',
            expect: 'content',
            apply: (f) => [append(f, 'docs/fourth/index.md', '\nSee `*Third`.\n')],
          };
        }
        state.thirdKeyword = true;
        return {
          name: 'keyword add',
          expect: 'content',
          apply: (f) => [
            update(
              f.write(
                'docs/third/index.md',
                `---\nkeyword: Third\n---\n${f.read('docs/third/index.md')}`,
              ),
            ),
          ],
        };
      },
    ],
    [
      1,
      () => {
        if (!state.thirdKeyword || state.fourthUses)
          return {
            name: 'touch',
            expect: 'content',
            apply: (f) => [update(f.write('docs/third/index.md', f.read('docs/third/index.md')))],
          };
        state.thirdKeyword = false;
        return {
          name: 'keyword remove',
          expect: 'content',
          apply: (f) => [
            update(
              f.write(
                'docs/third/index.md',
                f.read('docs/third/index.md').replace('---\nkeyword: Third\n---\n', ''),
              ),
            ),
          ],
        };
      },
    ],
    [
      2,
      () => ({
        name: 'demo template',
        expect: 'content',
        apply: (f) => [update(f.write('docs/guide/demo.html', `<b>${word()}</b>`))],
      }),
    ],
    [
      1,
      () => ({
        name: 'demo style',
        expect: 'content',
        apply: (f) => [
          update(f.write('docs/guide/demo.scss', `b { margin: ${Math.floor(next() * 9)}px; }`)),
        ],
      }),
    ],
    [
      2,
      () => {
        const file = pick([
          ...guides,
          'docs/shared/include.md',
          'docs/shared/nested.md',
          'docs/guide/demo.html',
        ]);
        return {
          name: `revert ${file}`,
          expect: 'content',
          apply: (f) => [update(f.write(file, revertText(f, file)))],
        };
      },
    ],
    [
      1,
      () => {
        const file = pick(guides);
        return {
          name: `touch ${file}`,
          expect: 'content',
          apply: (f) => [update(f.write(file, f.read(file)))],
        };
      },
    ],
    [
      2,
      () => {
        const file = pick(guides);
        state.pending = file;
        return {
          name: `safe-write delete ${file}`,
          expect: 'content',
          apply: (f) => [
            { kind: 'delete', path: atomicSave(f, file, f.read(file) + `\n${word()}.\n`) },
          ],
        };
      },
    ],
    [
      1,
      () => {
        state.fresh++;
        const name = `fresh-${state.fresh}.md`;
        return {
          name: `new include ${name}`,
          expect: 'content',
          apply: (f) => {
            f.write(`docs/shared/${name}`, `Fresh ${state.fresh}.`);
            return [append(f, 'docs/second/index.md', `\n{% include "../shared/${name}" %}\n`)];
          },
        };
      },
    ],
    [
      1,
      () => ({
        name: 'API edit',
        expect: 'content',
        apply: (f) => [
          update(
            f.write(
              'docs/api.ts',
              `/** ${word()}. */ export class Actual { /** Value. */ value = 1; }`,
            ),
          ),
        ],
      }),
    ],
    [
      1,
      () => ({
        name: 'page module edit',
        expect: 'content',
        apply: (f) => [
          update(
            f.write('docs/third/ng-doc.page.ts', page(pick(['Third', 'Third Renamed']), 'third')),
          ),
        ],
      }),
    ],
    [
      1,
      () => ({
        name: 'page data edit',
        expect: 'content',
        apply: (f) => [
          update(f.write('docs/data/ng-doc.page.ts', dataPage(1 + Math.floor(next() * 3)))),
        ],
      }),
    ],
    [
      1,
      () => ({
        name: 'demo .ts edit',
        expect: 'content',
        apply: (f) => [
          update(
            f.write(
              'docs/guide/demo.ts',
              f.initial['docs/guide/demo.ts'].replace("'fixture-demo'", `'fixture-${word()}'`),
            ),
          ),
        ],
      }),
    ],
    [
      1,
      () => ({
        name: 'playground edit',
        expect: 'content',
        apply: (f) =>
          next() < 0.5
            ? [update(f.write('docs/play/box.ts', boxComponent(pick(['Box', 'Crate', 'Chest']))))]
            : [
                update(
                  f.write(
                    'docs/play/ng-doc.page.ts',
                    playPage(`<fixture-box label="${word()}"></fixture-box>`),
                  ),
                ),
              ],
      }),
    ],
  ];
  const total = kinds.reduce((sum, [weight]) => sum + weight, 0);
  while (steps.length < count) {
    if (state.pending) {
      const file = state.pending;
      state.pending = undefined;
      steps.push({
        name: `safe-write create ${file}`,
        expect: 'content',
        apply: (f) => [{ kind: 'create', path: f.path(file) }],
      });
      continue;
    }
    let roll = next() * total;
    const [, make] = kinds.find(([weight]) => (roll -= weight) < 0) ?? kinds[0];
    steps.push(make());
  }
  return steps;
}

/** An earlier state of a file: its initial bytes, keeping the keyword and consumer toggles valid. */
export function revertText(f: Fixture, file: string): string {
  const current = f.read(file);
  if (file === 'docs/third/index.md' && current.startsWith('---\nkeyword: Third'))
    return `---\nkeyword: Third\n---\n${f.initial[file]}`;
  if (file === 'docs/fourth/index.md' && current.includes('`*Third`'))
    return `${f.initial[file]}\nSee \`*Third\`.\n`;
  if (file === 'docs/guide/index.md') return current.replace(/\n[a-z]+\d+\.\n/g, '\n');
  if (file === 'docs/second/index.md') return current.replace(/\n[a-z]+\d+\.\n/g, '\n');
  return f.initial[file];
}
