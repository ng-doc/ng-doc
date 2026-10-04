import path from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';

import { GeneratorContentCompiler } from '../content/content-compiler';
import type { CompilationResult, Dependency } from '../contracts';
import type { DryRunRecord } from './index';
import {
  type ArmStep,
  type Step,
  appendTo,
  cold,
  disposeAll,
  fixture,
  published,
  runChain,
  success,
  targetedArms,
  tree,
  update,
} from './testing/incremental-support';
import { fixture as corpusFixture, page, update as corpusUpdate } from './testing/targeted-corpus';

afterEach(disposeAll);

// The discovery input partition: each entry records its own evaluation closure and an `evaluated`
// digest of its live value, and the configuration digest covers only the configuration's inputs.

/**
 * A category whose title comes from a helper module, two pages under it (one reads a shared state
 * another page module mutates, one reads its data from a file its module reads itself, which no
 * path records), and a page that mutates the shared state.
 */
const partitionFiles = (root: string): Record<string, string> => ({
  'docs/state.ts': `export const state = { note: 'initial' }; export const read = () => state.note;`,
  // A function in a live value: its result depends on the shared state it closes over.
  'docs/closure/ng-doc.page.ts': `import { read } from '../state'; ${page('Closure', 'closure', ', data: { read }')}`,
  'docs/closure/index.md': '# Closure\n\nRead: {{ NgDocPage.data.read() }}\n',
  'docs/cat/meta.ts': `export const catTitle = 'Cat';`,
  'docs/cat/note-data.json': JSON.stringify({ note: 'first' }),
  'docs/cat/ng-doc.category.ts': categoryModule(root, ''),
  'docs/cat/child/ng-doc.page.ts': `import Cat from '../ng-doc.category'; import { state } from '../../state'; ${page('Child', 'child', ', category: Cat, order: 1, data: state')}`,
  'docs/cat/child/index.md': '# Child\n\nNote: {{ NgDocPage.data.note }}\n',
  'docs/cat/sibling/data.json': JSON.stringify({ text: 'first', unused: 1 }),
  'docs/cat/sibling/ng-doc.page.ts': siblingPage(root, `['production', 'development']`),
  'docs/cat/sibling/index.md': '# Sibling\n\nText: {{ NgDocPage.data.text }}\n',
  'docs/mutator/ng-doc.page.ts': mutatorPage('mutated-1'),
  'docs/mutator/index.md': '# Mutator\n',
});

const siblingPage = (root: string, tags: string) =>
  `import { readFileSync } from 'node:fs'; import Cat from '../ng-doc.category'; ${page(
    'Sibling',
    'sibling',
    `, category: Cat, order: 2, onlyForTags: ${tags}, data: JSON.parse(readFileSync(${JSON.stringify(
      path.join(root, 'docs/cat/sibling/data.json'),
    )}, 'utf8'))`,
  )}`;
/** The category also reads a value from a file itself (no path records it). */
const categoryModule = (root: string, extra: string) =>
  `import { readFileSync } from 'node:fs'; import { catTitle } from './meta'; const Cat = { title: catTitle, route: 'cat', note: JSON.parse(readFileSync(${JSON.stringify(
    path.join(root, 'docs/cat/note-data.json'),
  )}, 'utf8')).note${extra} }; export default Cat;`;
const mutatorPage = (note: string) =>
  `import { state } from '../state'; state.note = '${note}'; ${page('Mutator', 'mutator')}`;
const childPage = (order: number) =>
  `import Cat from '../ng-doc.category'; import { state } from '../../state'; ${page('Child', 'child', `, category: Cat, order: ${order}, data: state`)}`;

/**
 * The candidates of an entry edit: the entries whose descriptor or evaluated value changed, plus
 * the closure page, whose live value holds a function and is therefore keyed by the whole bundle
 * (a documented false positive of the evaluated digest: any module edit reaches it).
 */
const partitionCandidates = (units: number) => (record: DryRunRecord) =>
  expect({ reason: record.reason, units: record.candidates.units }).toEqual({
    reason: undefined,
    units,
  });

const partitionSteps: ArmStep[] = [
  {
    // The category and both of its pages (their breadcrumbs and live values) are described again.
    name: 'category title edit (a module the category and its pages evaluate)',
    expect: 'content',
    apply: (f) => [
      corpusUpdate(f.write('docs/cat/meta.ts', `export const catTitle = 'Category';`)),
    ],
    check: partitionCandidates(4),
  },
  {
    name: 'category module edit',
    expect: 'content',
    apply: (f) => [
      corpusUpdate(
        f.write('docs/cat/ng-doc.category.ts', categoryModule(f.root, ', expanded: true')),
      ),
    ],
    check: partitionCandidates(4),
  },
  {
    name: 'page title edit',
    expect: 'content',
    apply: (f) => [
      corpusUpdate(f.write('docs/third/ng-doc.page.ts', page('Third Renamed', 'third'))),
    ],
    check: partitionCandidates(2),
  },
  {
    // The order is a descriptor field: the navigation is aggregated in full.
    name: 'entry reorder',
    expect: 'content',
    apply: (f) => [corpusUpdate(f.write('docs/cat/child/ng-doc.page.ts', childPage(3)))],
    check: partitionCandidates(2),
  },
  {
    name: 'onlyForTags leaves a page out',
    expect: 'full',
    apply: (f) => [
      corpusUpdate(
        f.write('docs/cat/sibling/ng-doc.page.ts', siblingPage(f.root, `['production']`)),
      ),
    ],
  },
  {
    name: 'onlyForTags keeps the page again',
    expect: 'full',
    apply: (f) => [
      corpusUpdate(
        f.write(
          'docs/cat/sibling/ng-doc.page.ts',
          siblingPage(f.root, `['production', 'development']`),
        ),
      ),
    ],
  },
  {
    // Every entry whose evaluated value changed: the mutator, the page that reads the state it
    // mutates, and the closure page.
    name: 'a module mutates the shared state another page reads',
    expect: 'content',
    apply: (f) => [corpusUpdate(f.write('docs/mutator/ng-doc.page.ts', mutatorPage('mutated-2')))],
    check: partitionCandidates(3),
  },
  {
    // No path shows it: only the page's evaluated value changed. Its units become candidates.
    name: 'unreported data file edit a template reads, with a reported edit of another page',
    expect: 'content',
    apply: (f) => {
      f.write('docs/cat/sibling/data.json', JSON.stringify({ text: 'second', unused: 1 }));
      return [appendTo(f, 'docs/fourth/index.md', '\nReported.\n')];
    },
    check: (record) => {
      expect(record.reason).toBeUndefined();
      expect(record.candidates.units).toBe(2);
    },
  },
  {
    // `NgDocPage.data` that no template reads: recomputed, and byte-identical.
    name: 'unreported data file edit no template reads, with a reported edit of another page',
    expect: 'content',
    apply: (f) => {
      f.write('docs/cat/sibling/data.json', JSON.stringify({ text: 'second', unused: 2 }));
      return [appendTo(f, 'docs/fourth/index.md', '\nReported again.\n')];
    },
    check: (record) => expect(record.candidates.units).toBe(2),
  },
  {
    // The category's own unit records its evaluated value: it must be a candidate too (its pages
    // are, through their live guide values, which include their category).
    name: 'unreported category value edit, with a reported edit of another page',
    expect: 'content',
    apply: (f) => {
      f.write('docs/cat/note-data.json', JSON.stringify({ note: 'second' }));
      return [appendTo(f, 'docs/fourth/index.md', '\nReported a third time.\n')];
    },
    check: (record) => expect(record.candidates.units).toBe(4),
  },
  {
    name: 'page added',
    expect: 'content',
    apply: (f) => [
      { kind: 'create', path: f.write('docs/cat/added/index.md', '# Added\n') },
      {
        kind: 'create',
        path: f.write(
          'docs/cat/added/ng-doc.page.ts',
          `import Cat from '../ng-doc.category'; ${page('Added', 'added', ', category: Cat')}`,
        ),
      },
    ],
  },
  {
    name: 'page renamed (folder move)',
    expect: 'content',
    apply: (f) => {
      const text = f.read('docs/cat/added/ng-doc.page.ts');
      return [
        { kind: 'delete', path: f.remove('docs/cat/added/ng-doc.page.ts') },
        { kind: 'delete', path: f.remove('docs/cat/added/index.md') },
        { kind: 'create', path: f.write('docs/cat/moved/index.md', '# Added\n') },
        { kind: 'create', path: f.write('docs/cat/moved/ng-doc.page.ts', text) },
      ];
    },
  },
  {
    name: 'page removed',
    expect: 'content',
    apply: (f) => [
      { kind: 'delete', path: f.remove('docs/cat/moved/ng-doc.page.ts') },
      { kind: 'delete', path: f.remove('docs/cat/moved/index.md') },
    ],
  },
];

test('partition differential: titles, order, onlyForTags, entries and evaluated inputs equal the targeted rebuild off and cold builds', async () => {
  const f = corpusFixture(false, { discovery: { tags: ['development'] } }, partitionFiles);
  const outcome = await targetedArms(f, partitionSteps);
  expect(outcome.targeted).toBe(partitionSteps.filter((step) => step.expect === 'content').length);
  expect(outcome.failed).toBe(0);
  const site = Object.values(tree(f.path('out'))).join('\n');
  expect(site).toContain('Note: mutated-2');
  expect(site).toContain('Read: mutated-2');
  expect(site).toContain('Text: second');
}, 600_000);

test('partition: on the full path an entry edit changes only its entry, and an evaluated change is its reason', async () => {
  const files = (root: string): Record<string, string> => ({
    'tsconfig.json': JSON.stringify({
      compilerOptions: { target: 'ES2022', types: [], skipLibCheck: true },
      include: ['docs/api*.ts'],
    }),
    'ng-doc.config.ts': `export default { docsPath: 'docs', cache: false };`,
    'docs/ng-doc.api.ts': `const api = { title: 'API', scopes: [{ name: 'Public', route: 'public', include: ['docs/api*.ts'] }] }; export default api;`,
    'docs/api.ts': '/** Actual declaration. */ export class Actual { /** Value. */ value = 1; }',
    'docs/reader/data.json': JSON.stringify({ note: 'first' }),
    'docs/reader/ng-doc.page.ts': `import { readFileSync } from 'node:fs'; ${page(
      'Reader',
      'reader',
      `, data: JSON.parse(readFileSync(${JSON.stringify(path.join(root, 'docs/reader/data.json'))}, 'utf8'))`,
    )}`,
    'docs/reader/index.md': '# Reader\n\nNote: {{ NgDocPage.data.note }}\n',
    'docs/other/ng-doc.page.ts': page('Other', 'other'),
    'docs/other/index.md': '# Other\n',
    // A function in a live value closes over shared state another page module mutates.
    'docs/state.ts': `export const state = { note: 'initial' }; export const read = () => state.note;`,
    'docs/closure/ng-doc.page.ts': `import { read } from '../state'; ${page('Closure', 'closure', ', data: { read }')}`,
    'docs/closure/index.md': '# Closure\n\nRead: {{ NgDocPage.data.read() }}\n',
    'docs/mutator/ng-doc.page.ts': mutatorPage('mutated-1'),
    'docs/mutator/index.md': '# Mutator\n',
  });
  const f = fixture(false, files);
  const compiled: string[] = [];
  const compileContent = GeneratorContentCompiler.prototype.compile;
  vi.spyOn(GeneratorContentCompiler.prototype, 'compile').mockImplementation(function (
    this: GeneratorContentCompiler,
    ...args: Parameters<typeof compileContent>
  ) {
    compiled.push(args[0].id);
    return compileContent.apply(this, args);
  });
  const chain: Step[] = [
    {
      name: 'other page title',
      apply: (f) => [update(f.write('docs/other/ng-doc.page.ts', page('Other Renamed', 'other')))],
    },
    {
      // No recorded path of the reader changes: its data file is read by its module itself.
      name: 'unreported data file edit, with an edit of another page',
      apply: (f) => {
        f.write('docs/reader/data.json', JSON.stringify({ note: 'second' }));
        return [update(f.write('docs/other/index.md', '# Other\n\nEdited.\n'))];
      },
    },
    {
      name: 'a module mutates the state a live function reads',
      apply: (f) => [update(f.write('docs/mutator/ng-doc.page.ts', mutatorPage('mutated-2')))],
    },
  ];
  const colds: CompilationResult[] = [];
  const reference = await runChain(
    f,
    f.create({ incrementalReuse: false }),
    async () => {
      colds.push(await cold(f));
    },
    chain,
  );
  f.reset();
  const rendered: string[][] = [];
  const incremental = await runChain(
    f,
    f.create(),
    () => {
      rendered.push(compiled.splice(0));
    },
    chain,
  );
  for (const [index, result] of incremental.entries()) {
    expect(JSON.stringify(result)).toBe(JSON.stringify(reference[index]));
    expect(published(result)).toEqual(published(colds[index]));
  }
  const unit = (result: CompilationResult, title: string) =>
    success(result).artifacts.find((artifact) =>
      artifact.routes.some((route) => route.title === title),
    )!;
  // The title edit keeps the configuration and every discovery input of the reader (the page
  // module is also read by the program: what the semantic dependencies record is not
  // discovery's).
  expect(success(incremental[1]).configuration!.digest).toBe(
    success(incremental[0]).configuration!.digest,
  );
  const semantic = (item: Dependency) => item.kind.startsWith('semantic');
  const changed = unit(incremental[1], 'Reader').dependencies.filter(
    (item) =>
      !semantic(item) &&
      !unit(incremental[0], 'Reader').dependencies.some(
        (old) => JSON.stringify(old) === JSON.stringify(item),
      ),
  );
  expect(changed).toEqual([]);
  expect(
    rendered[1].some((id) => id.startsWith(`${unit(incremental[1], 'Other Renamed').id}:`)),
  ).toBe(true);
  // The data edit rebuilds the reader for its evaluated value, and renders nothing but the reader
  // and the edited page: every other IR refreshes its evaluated dependency unchanged.
  const reader = unit(incremental[2], 'Reader');
  const other = unit(incremental[2], 'Other Renamed');
  expect(incremental[2].whyRebuilt).toContainEqual({
    ownerId: reader.id,
    reason: 'evaluated',
    detail: expect.stringContaining(':guide:'),
  });
  expect(rendered[2].filter((id) => id.startsWith(`${reader.id}:`)).length).toBeGreaterThan(0);
  expect(
    rendered[2].filter((id) => !id.startsWith(`${reader.id}:`) && !id.startsWith(`${other.id}:`)),
  ).toEqual([]);
  expect(JSON.stringify(published(incremental[2]))).toContain('Note: second');
  expect(JSON.stringify(published(incremental[3]))).toContain('Read: mutated-2');
}, 240_000);
