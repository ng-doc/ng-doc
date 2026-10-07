import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';

import { SemanticServiceImpl } from '../semantic/semantic-service';
import { type GenerationRecords, traceRecords } from './fold';
import { type DryRunRecord, incrementalRetention, targetedDryRun } from './index';
import { TargetedGeneration } from './targeted';
import {
  type ArmStep,
  type LoaderCalls,
  appendTo,
  arm,
  cleanup,
  coldCorpus,
  disposeAll,
  published,
  targetedArms,
  tree,
  watchCompile,
} from './testing/incremental-support';
import {
  fixture as corpusFixture,
  page,
  settle,
  update as corpusUpdate,
} from './testing/targeted-corpus';

// The targeted rebuild on, off and cold builds of every step, byte for byte (fixed cases: live values, failures, keyword loaders and discovery changes); the
// arms and what they compare are described at `targetedArms` in testing/incremental-support.ts.

afterEach(disposeAll);

/** A guide whose playground controls come from a file its page module reads itself (unrecorded). */
const liveValues = (root: string): Record<string, string> => ({
  'docs/guide/controls.json': JSON.stringify({
    label: { type: 'string', inputName: 'label', isManual: true },
  }),
  'docs/guide/ng-doc.page.ts': `import { readFileSync } from 'node:fs'; import { Demo } from './demo'; /** Guide introduction. */ ${page(
    'Guide',
    'guide',
    `, demos: { Demo }, playgrounds: { Box: { target: Demo, template: '<ng-doc-selector></ng-doc-selector>', controls: JSON.parse(readFileSync(${JSON.stringify(
      path.join(root, 'docs/guide/controls.json'),
    )}, 'utf8')) } }`,
  )}`,
  'docs/guide/index.md': `---\nkeyword: Guide\n---\n# Guide heading\n\nBody with \`Actual\`.\n\n{% include "../shared/include.md" %}\n\n{{ NgDocActions.demo("Demo") }}\n\n{{ NgDocActions.playground("Box") }}\n`,
  'outside/extra.ts': '/** Outside the tsconfig. */ export class Outside {}',
  // The configured keywords are read from a file (unrecorded); the second page uses one. (A
  // keyword loader's result would be pinned on a targeted generation instead.)
  'docs/keywords.json': JSON.stringify({ LoadedKw: { url: '/loaded-1', title: 'Loaded' } }),
  'ng-doc.config.ts': `import { readFileSync } from 'node:fs'; export default { docsPath: 'docs', cache: false, keywords: { keywords: JSON.parse(readFileSync(${JSON.stringify(
    path.join(root, 'docs/keywords.json'),
  )}, 'utf8')) } };`,
  'docs/second/index.md':
    '# Second\n\nSee `*Guide` for details and `LoadedKw`.\n\n{% include "../shared/include.md" %}\n',
  // A page whose title its module reads from a file (unrecorded): only discovery sees it change.
  'docs/third/meta.json': JSON.stringify({ title: 'Third' }),
  'docs/third/ng-doc.page.ts': `import { readFileSync } from 'node:fs'; const page = { title: JSON.parse(readFileSync(${JSON.stringify(
    path.join(root, 'docs/third/meta.json'),
  )}, 'utf8')).title, route: 'third', mdFile: './index.md' }; export default page;`,
});

const fixedSteps: ArmStep[] = [
  {
    // A configured keyword changed with no recorded input: only the binding comparison over
    // every key finds it, and its consumer (the second page) is linked again.
    name: 'unreported configured keywords file edit, with a reported edit of another page',
    expect: 'content',
    apply: (f) => {
      f.write(
        'docs/keywords.json',
        JSON.stringify({ LoadedKw: { url: '/loaded-2', title: 'Loaded' } }),
      );
      return [appendTo(f, 'docs/fourth/index.md', '\nReported.\n')];
    },
    check: (record) => {
      expect(record.keysFrom).toBe('all');
      expect(record.keys).toEqual(['LoadedKw']);
      expect(record.consumers).toBe(1);
    },
  },
  {
    // The overlay re-digested every binding above; this edit is found against those bindings.
    name: 'the configured keywords file is edited back',
    expect: 'content',
    apply: (f) => {
      f.write(
        'docs/keywords.json',
        JSON.stringify({ LoadedKw: { url: '/loaded-1', title: 'Loaded' } }),
      );
      return [appendTo(f, 'docs/fourth/index.md', '\nReported again.\n')];
    },
    check: (record) =>
      expect(record).toMatchObject({ keysFrom: 'all', keys: ['LoadedKw'], consumers: 1 }),
  },
  {
    // The fresh-discovery check: the page's descriptor changed, which no path shows; the page
    // becomes a candidate.
    name: 'unreported page title edit (read by its module), with a reported edit of another page',
    expect: 'content',
    apply: (f) => {
      f.write('docs/third/meta.json', JSON.stringify({ title: 'Third Renamed' }));
      return [appendTo(f, 'docs/second/index.md', '\nReported.\n')];
    },
    check: (record) => expect(record.candidates.units).toBe(2),
  },
  {
    name: 'unreported playground controls edit, with a reported edit of another page',
    expect: 'content',
    // The full path itself re-describes the guide (new playground values) but reuses its rendered
    // content, because a page module's own file read is recorded nowhere: a documented residual
    // of the full path. The targeted path must equal the full path, which it can only do by
    // comparing the live guide values; the cold build is compared again from the next step on.
    cold: false,
    apply: (f) => {
      f.write(
        'docs/guide/controls.json',
        JSON.stringify({ caption: { type: 'string', inputName: 'caption', isManual: true } }),
      );
      return [appendTo(f, 'docs/third/index.md', '\nReported.\n')];
    },
  },
  {
    name: 'a page breaks while a shared include changes (the generation fails)',
    expect: 'full',
    apply: (f) => [
      corpusUpdate(f.write('docs/shared/nested.md', 'Edited while another page is broken.')),
      corpusUpdate(f.write('docs/third/index.md', '{% include "./missing.md" %}')),
    ],
  },
  {
    name: 'only the broken page is fixed (the include edit is pending since the base)',
    expect: 'content',
    apply: (f) => [corpusUpdate(f.write('docs/third/index.md', '# Third\n\nFixed.\n'))],
  },
  {
    name: 'a guide starts to render a declaration outside the program (mutates it)',
    expect: 'content',
    apply: (f) => [
      appendTo(f, 'docs/fourth/index.md', '\n{{ NgDocApi.details("outside/extra.ts#Outside") }}\n'),
    ],
  },
  {
    name: 'the next edit after a mutated program',
    expect: 'full',
    apply: (f) => [appendTo(f, 'docs/second/index.md', '\nAfter the mutation.\n')],
  },
  {
    // The full generation above rebuilt the program and reused the page's content, so nothing
    // mutated it again: this generation is targeted.
    name: 'the declaration is removed again',
    expect: 'content',
    apply: (f) => [corpusUpdate(f.write('docs/fourth/index.md', '# Fourth\n\nNothing yet.\n'))],
  },
  {
    name: 'a content edit once the program is retained again',
    expect: 'content',
    apply: (f) => [appendTo(f, 'docs/second/index.md', '\nRetained again.\n')],
  },
];

test('targeted differential: live guide values, a failed generation, pending changes and a mutated program', async () => {
  const f = corpusFixture(false, {}, liveValues);
  const outcome = await targetedArms(f, fixedSteps);
  expect(outcome.failed).toBe(1);
  // The committed site carries the playground control read from the edited file.
  expect(Object.values(tree(f.path('out'))).join('\n')).toContain('caption');
}, 600_000);

test('targeted differential: a change a candidate reads after the sweep runs the generation FULL (digest conflict)', async () => {
  const f = corpusFixture();
  const on = arm(f, true);
  await settle();
  on.base = (await watchCompile(f, on, 1, []))!.candidate;
  // The shared include changes after the sweep and before the candidate renders it: the other
  // consumer of the include still holds the old digest, which the full path would refresh.
  const admit = TargetedGeneration.prototype.admit;
  vi.spyOn(TargetedGeneration.prototype, 'admit').mockImplementation(async function (
    this: TargetedGeneration,
    ...args: Parameters<typeof admit>
  ) {
    f.write('docs/shared/nested.md', 'Changed during the generation.');
    return admit.apply(this, args);
  });
  const reported = appendTo(f, 'docs/second/index.md', '\nReported.\n');
  await settle();
  const result = await watchCompile(f, on, 2, [reported]);
  expect(targetedDryRun().last).toMatchObject({ published: 'full' });
  expect(targetedDryRun().last?.reason).toMatch(/^digest conflict: .*nested\.md$/);
  vi.restoreAllMocks();
  expect(published(result)).toEqual(published(await coldCorpus(f)));
}, 240_000);

test('targeted differential: an exception inside the targeted attempt runs the generation FULL', async () => {
  const f = corpusFixture();
  const on = arm(f, true);
  await settle();
  on.base = (await watchCompile(f, on, 1, []))!.candidate;
  vi.spyOn(TargetedGeneration.prototype, 'closure').mockImplementation(() => {
    throw new Error('injected');
  });
  const reported = appendTo(f, 'docs/second/index.md', '\nReported.\n');
  await settle();
  const result = await watchCompile(f, on, 2, [reported]);
  expect(targetedDryRun().last).toMatchObject({
    published: 'full',
    reason: 'targeted attempt threw: injected',
  });
  vi.restoreAllMocks();
  expect(published(result)).toEqual(published(await coldCorpus(f)));
}, 240_000);

test('targeted differential: a full attempt after the admission enumerated the API entries enumerates them again from scratch', async () => {
  // Two API entries: each one's routes are disambiguated against the earlier entries' only, so
  // the full attempt must not see what the admission enumerated.
  const f = corpusFixture(false, {}, () => ({
    'docs/more/lib.ts': '/** More thing. */ export class MoreThing { /** Size. */ size = 2; }',
    'docs/more/ng-doc.api.ts': `const api = { title: 'More API', route: 'more-api', scopes: [{ name: 'More', route: 'more', include: ['docs/more/lib*.ts'] }] }; export default api;`,
  }));
  const on = arm(f, true);
  await settle();
  on.base = (await watchCompile(f, on, 1, []))!.candidate;
  const calls: Array<{ entry: string; registered: string[] }> = [];
  const enumerate = SemanticServiceImpl.prototype.enumerateApi;
  vi.spyOn(SemanticServiceImpl.prototype, 'enumerateApi').mockImplementation(function (
    this: SemanticServiceImpl,
    entryId: string,
  ) {
    const state = (
      this as unknown as {
        snapshot?: { declarations: Map<string, { descriptor: { apiEntryId: string } }> };
      }
    ).snapshot;
    calls.push({
      entry: entryId,
      registered: [
        ...new Set(
          [...(state?.declarations.values() ?? [])].map((item) => item.descriptor.apiEntryId),
        ),
      ]
        .filter((id) => id !== entryId)
        .sort(),
    });
    return enumerate.call(this, entryId);
  });
  vi.spyOn(TargetedGeneration.prototype, 'closure').mockImplementation(() => {
    throw new Error('injected');
  });
  const edited = corpusUpdate(
    f.write(
      'docs/api.ts',
      '/** Edited declaration, see `*Guide`. */ export class Actual { /** Value. */ value = 1; }',
    ),
  );
  await settle();
  const result = await watchCompile(f, on, 2, [edited]);
  vi.restoreAllMocks();
  expect(targetedDryRun().last).toMatchObject({
    published: 'full',
    reason: 'targeted attempt threw: injected',
  });
  // The admission enumerated both entries, then the full attempt enumerated them again, each
  // seeing only the entries before it.
  expect(calls).toHaveLength(4);
  const [first, second] = calls.slice(2);
  expect(first.registered).toEqual([]);
  expect(second.registered).toEqual([first.entry]);
  expect(published(result)).toEqual(published(await coldCorpus(f)));
}, 240_000);

test('targeted differential: a unit rendered in its generation is replayed with the reuse projection', async () => {
  // The full path records a unit it rendered with the fresh projection, and the same unit with
  // the reuse projection in the next generation; the targeted path must record that as well.
  const f = corpusFixture();
  const on = arm(f, true);
  const traced: GenerationRecords[] = [];
  traceRecords((records) => traced.push(records));
  try {
    await settle();
    on.base = (await watchCompile(f, on, 1, []))!.candidate;
    const second = on.base!.artifacts.find((item) =>
      item.routes.some((route) => route.path === 'second'),
    )!.id;
    const steps = (records: GenerationRecords) =>
      records.units.flatMap((unit) => unit.render).filter((step) => step.id.startsWith(second));
    // Written, then settled past the stat margin, so the next generation replays the page.
    const edited = appendTo(f, 'docs/second/index.md', '\nEdited.\n');
    await settle();
    on.base = (await watchCompile(f, on, 2, [edited]))!.candidate;
    expect(steps(traced.at(-1)!).map((step) => step.projection)).toContain('fresh');
    const third = appendTo(f, 'docs/third/index.md', '\nEdited.\n');
    await settle();
    const result = await watchCompile(f, on, 3, [third]);
    expect(targetedDryRun().last).toMatchObject({ published: 'targeted' });
    expect(targetedDryRun().last?.closure).not.toContain(second);
    const replayed = steps(traced.at(-1)!);
    expect(replayed.length).toBeGreaterThan(0);
    expect(
      replayed.every((step) => step.projection === 'reuse' && !step.emitted.dependencies.length),
    ).toBe(true);
    expect(published(result)).toEqual(published(await coldCorpus(f)));
  } finally {
    traceRecords(undefined);
  }
}, 240_000);

/**
 * A network-style keyword loader: a local HTTP server that serves `RemoteKw` at version
 * `version` and counts the requests (one per loader invocation).
 */
async function keywordServer() {
  const state = { version: 1, requests: 0 };
  const server = createServer((_request, response) => {
    state.requests++;
    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify({ RemoteKw: { title: 'Remote', url: `/remote-${state.version}` } }),
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  cleanup.push(() => {
    server.closeAllConnections();
    return new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  /** Runs `compile` while the server serves `version`. */
  const at =
    (version: number) =>
    async <T>(compile: () => Promise<T>): Promise<T> => {
      const live = state.version;
      state.version = version;
      try {
        return await compile();
      } finally {
        state.version = live;
      }
    };
  return { state, url, at };
}

/** The corpus with a keyword loader that fetches from `url`, and a page whose title is read from a file. */
const remoteLoader =
  (url: string) =>
  (root: string): Record<string, string> => ({
    'ng-doc.config.ts': `export default { docsPath: 'docs', cache: false, keywords: { loaders: [async function remoteStub() { const response = await fetch(${JSON.stringify(
      url,
    )}); return response.json(); }] } };`,
    'docs/second/index.md':
      '# Second\n\nSee `*Guide` for details and `RemoteKw`.\n\n{% include "../shared/include.md" %}\n',
    'docs/third/meta.json': JSON.stringify({ title: 'Third' }),
    'docs/third/ng-doc.page.ts': `import { readFileSync } from 'node:fs'; const page = { title: JSON.parse(readFileSync(${JSON.stringify(
      path.join(root, 'docs/third/meta.json'),
    )}, 'utf8')).title, route: 'third', mdFile: './index.md' }; export default page;`,
  });

test('targeted differential: keyword loaders are pinned on targeted generations and evaluated on every other one', async () => {
  const server = await keywordServer();
  const f = corpusFixture(false, {}, remoteLoader(server.url));
  const pinned = (calls: LoaderCalls, record: DryRunRecord) => {
    expect(calls).toEqual({ off: 1, on: 0 });
    expect(record.loaders).toBe('pinned');
  };
  const steps: ArmStep[] = [
    {
      name: 'a content edit keeps the loader result',
      expect: 'content',
      apply: (f) => [appendTo(f, 'docs/second/index.md', '\nEdited.\n')],
      check: (record, calls) => pinned(calls, record),
    },
    {
      // The targeted generation equals the full generation with the loader result it pinned.
      name: 'the remote keywords change with a content edit: the pinned result is kept',
      expect: 'content',
      apply: (f) => {
        server.state.version = 2;
        return [appendTo(f, 'docs/fourth/index.md', '\nEdited.\n')];
      },
      pinned: server.at(1),
      check: (record, calls) => {
        pinned(calls, record);
        expect(record).toMatchObject({ keysFrom: 'candidates', keys: [] });
      },
    },
    {
      // A page module is no input of the loaders: the targeted generation keeps their results.
      name: 'a page module edit is targeted and keeps the loader result',
      expect: 'content',
      apply: (f) => [
        corpusUpdate(f.write('docs/fourth/ng-doc.page.ts', page('Fourth Renamed', 'fourth'))),
      ],
      pinned: server.at(1),
      check: (record, calls) => pinned(calls, record),
    },
    {
      name: 'an unrecorded path (FULL before discovery) evaluates the loader',
      expect: 'full',
      apply: (f) => [{ kind: 'create', path: f.write('notes.txt', 'unrelated') }],
      check: (record, calls) => {
        expect(calls).toEqual({ off: 1, on: 1 });
        expect(record.loaders).toBeUndefined();
      },
    },
    {
      // An unreported page title change is found by the fresh-discovery check: its page is a
      // candidate, and the loader result stays pinned.
      name: 'an unreported page title change with a content edit is targeted',
      expect: 'content',
      apply: (f) => {
        f.write('docs/third/meta.json', JSON.stringify({ title: 'Third Renamed' }));
        return [appendTo(f, 'docs/second/index.md', '\nAgain.\n')];
      },
      check: (record, calls) => {
        pinned(calls, record);
        expect(record.candidates.units).toBe(2);
      },
    },
    {
      // Content by its paths; the fresh discovery adds the page (the structural class), and the
      // loader result stays pinned.
      name: 'an unreported new page with a content edit is targeted and keeps the loader result',
      expect: 'content',
      apply: (f) => {
        f.write('docs/extra/index.md', '# Extra\n');
        f.write('docs/extra/ng-doc.page.ts', page('Extra', 'extra'));
        return [appendTo(f, 'docs/second/index.md', '\nOnce again.\n')];
      },
      check: (record, calls) => {
        pinned(calls, record);
        expect(record.entries?.added).toHaveLength(1);
      },
    },
    {
      name: 'the next content edit keeps the loader result',
      expect: 'content',
      apply: (f) => [appendTo(f, 'docs/third/index.md', '\nEdited.\n')],
      check: (record, calls) => pinned(calls, record),
    },
    {
      name: 'an unreported page module failure while pinned fails as the full generation does',
      expect: 'full',
      apply: (f) => {
        f.write('docs/third/meta.json', '{');
        return [appendTo(f, 'docs/second/index.md', '\nOnce more.\n')];
      },
      check: (record, calls) => {
        expect(calls).toEqual({ off: 0, on: 0 });
        expect(record.loaders).toBe('refreshed');
      },
    },
    {
      // A generation that ends in discovery keeps no retained entry: FULL before discovery.
      name: 'the page module is fixed',
      expect: 'full',
      apply: (f) => {
        server.state.version = 3;
        f.write('docs/third/meta.json', JSON.stringify({ title: 'Third Renamed' }));
        return [appendTo(f, 'docs/fourth/index.md', '\nFixed.\n')];
      },
      check: (record, calls) => {
        expect(calls).toEqual({ off: 1, on: 1 });
        expect(record.loaders).toBeUndefined();
      },
    },
    {
      name: 'a content edit after the fix is pinned again',
      expect: 'content',
      apply: (f) => [appendTo(f, 'docs/second/index.md', '\nPinned again.\n')],
      check: (record, calls) => pinned(calls, record),
    },
  ];
  const outcome = await targetedArms(f, steps, () => server.state.requests);
  expect(outcome).toMatchObject({ targeted: 7, failed: 1 });
  expect(Object.values(tree(f.path('out'))).join('\n')).toContain('/remote-3');
  expect(targetedDryRun().counters).toMatchObject({ errors: 0, mismatches: 0 });
}, 600_000);

test('targeted verify: the full comparison keeps the pinned keyword loader results', async () => {
  const server = await keywordServer();
  const f = corpusFixture(false, {}, remoteLoader(server.url));
  const verify = arm(f, 'verify');
  await settle();
  verify.base = (await watchCompile(f, verify, 1, []))!.candidate;
  expect(server.state.requests).toBe(1);
  server.state.version = 2;
  const edited = appendTo(f, 'docs/second/index.md', '\nEdited.\n');
  await settle();
  const result = await watchCompile(f, verify, 2, [edited]);
  // A changed remote result cannot manufacture a mismatch: both compilations use the pin.
  expect(server.state.requests).toBe(1);
  expect(targetedDryRun().last).toMatchObject({ published: 'targeted', loaders: 'pinned' });
  expect(targetedDryRun().last?.mismatch).toBeUndefined();
  expect(verify.service.targetedResult(result)).toBe(true);
  expect(JSON.stringify(published(result))).toContain('/remote-1');
}, 240_000);

test('targeted differential: a discovery that changes between the pinned and the refreshed run synchronizes the program again', async () => {
  const server = await keywordServer();
  const f = corpusFixture(false, {}, remoteLoader(server.url));
  const on = arm(f, true);
  await settle();
  on.base = (await watchCompile(f, on, 1, []))!.candidate;
  // The page title changes after the pinned discovery; the generation then runs FULL.
  vi.spyOn(TargetedGeneration.prototype, 'admit').mockImplementation(async function (
    this: TargetedGeneration,
  ) {
    f.write('docs/third/meta.json', JSON.stringify({ title: 'Third Raced' }));
    this.full('injected');
    return false;
  });
  const reported = appendTo(f, 'docs/second/index.md', '\nReported.\n');
  await settle();
  server.state.version = 2;
  const result = await watchCompile(f, on, 2, [reported]);
  vi.restoreAllMocks();
  expect(targetedDryRun().last).toMatchObject({
    published: 'full',
    reason: 'injected',
    loaders: 'refreshed',
  });
  expect(incrementalRetention().last?.synchronization?.path).toBe('full');
  expect(server.state.requests).toBe(2);
  const cold = published(await coldCorpus(f));
  expect(JSON.stringify(cold)).toContain('Third Raced');
  expect(published(result)).toEqual(cold);
}, 240_000);

/** A page whose code block shows a named snippet of a program file. */
const namedSnippet = (region: string, outside: string, id: string = 'greeting'): string =>
  [
    'export class Greeter {',
    `  // snippet#${id}`,
    `  greet(): string { return '${region}'; }`,
    `  // snippet#${id}`,
    `  other(): string { return '${outside}'; }`,
    '}',
    '',
  ].join('\n');

test('targeted differential: edits of a file a code block shows a named snippet of', async () => {
  const f = corpusFixture(false, {}, () => ({
    'docs/fourth/examples/greeting.ts': namedSnippet('Region one', 'Outside one'),
    'docs/fourth/index.md': '# Fourth\n\n```ts file="./examples/greeting.ts"#greeting\n```\n',
  }));
  const shown = () => Object.values(tree(f.path('out'))).join('\n');
  const outcome = await targetedArms(f, [
    {
      name: 'an edit inside the snippet',
      expect: 'content',
      apply: (g) => [
        corpusUpdate(
          g.write('docs/fourth/examples/greeting.ts', namedSnippet('Region two', 'Outside one')),
        ),
      ],
    },
    {
      name: 'an edit outside the snippet',
      expect: 'content',
      apply: (g) => [
        corpusUpdate(
          g.write('docs/fourth/examples/greeting.ts', namedSnippet('Region two', 'Outside two')),
        ),
      ],
    },
    {
      name: 'the snippet renamed in the file',
      // The targeted attempt fails, and a failed attempt runs the generation FULL.
      expect: 'full',
      fails: 'CONTENT_SNIPPET_UNKNOWN',
      apply: (g) => [
        corpusUpdate(
          g.write(
            'docs/fourth/examples/greeting.ts',
            namedSnippet('Region two', 'Outside two', 'hello'),
          ),
        ),
      ],
    },
    {
      name: 'the code block names the new id',
      // After a failed generation, the recovery compiles in full.
      expect: 'full',
      apply: (g) => [
        corpusUpdate(
          g.write(
            'docs/fourth/index.md',
            '# Fourth\n\n```ts file="./examples/greeting.ts"#hello\n```\n',
          ),
        ),
      ],
    },
    {
      name: 'an edit inside the renamed snippet',
      expect: 'content',
      apply: (g) => [
        corpusUpdate(
          g.write(
            'docs/fourth/examples/greeting.ts',
            namedSnippet('Region three', 'Outside two', 'hello'),
          ),
        ),
      ],
    },
  ]);
  expect(outcome.failed).toBe(1);
  // Only the region is shown, with the edits.
  expect(shown()).toContain('Region three');
  expect(shown()).not.toContain('Outside');
}, 600_000);
