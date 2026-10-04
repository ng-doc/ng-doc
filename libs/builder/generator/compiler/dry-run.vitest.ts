import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type { ArtifactSnapshot, CompilationContext, FileChange } from '../contracts';
import { UnitIndex } from '../graph/unit-index';
import { createRuntimeRetention } from '../worker/protocol';
import {
  type DryRunRecord,
  incrementalRetention,
  resetIncrementalRetention,
  resetTargetedDryRun,
  TARGETED_REBUILD_TRACE_ENV,
  targetedDryRun,
} from './index';
import {
  type Fixture,
  type Step,
  append,
  candidate,
  cleanup,
  corpus,
  fixture as corpusFixture,
  generation,
  seededSteps,
  settle,
  update,
} from './testing/targeted-corpus';

// The targeted rebuild's report in `verify` mode: every targeted generation is also compiled in
// full, the two results are compared byte for byte and the full one is published. The report
// says which path each generation took and why, and checks that the full generation changed no
// unit outside the targeted closure (a miss). Without the targeted rebuild (`false`) nothing is
// reported, and the results are byte-identical either way.

/** `targetedRebuild: 'verify'` for the services created from now on; otherwise it is off. */
let verify = false;
beforeEach(() => {
  verify = false;
  resetIncrementalRetention();
  resetTargetedDryRun();
});
afterEach(async () => {
  vi.restoreAllMocks();
  delete process.env[TARGETED_REBUILD_TRACE_ENV];
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
  resetIncrementalRetention();
  resetTargetedDryRun();
});

const fixture = (cache = false): Fixture => {
  const f = corpusFixture(cache);
  const create = f.create;
  f.create = (overrides = {}) =>
    create({ targetedRebuild: verify ? ('verify' as const) : false, ...overrides });
  return f;
};

interface Outcome {
  results: string[];
  records: DryRunRecord[];
}

/** Runs `steps` on one service, each generation committed as the next base. */
async function chain(f: Fixture, steps: Step[]): Promise<Outcome> {
  const service = f.create();
  await settle();
  const first = await generation(service, 1, undefined, []);
  let base = candidate(first, 'initial');
  const results = [JSON.stringify(first)];
  const records: DryRunRecord[] = [];
  for (const [index, step] of steps.entries()) {
    const changes = step.apply(f);
    await settle();
    const result = await generation(service, index + 2, base, changes);
    if (step.fails) {
      expect(
        result.diagnostics.map((item) => item.code),
        step.name,
      ).toContain(step.fails);
      expect(result.candidate, step.name).toBeUndefined();
    } else base = candidate(result, step.name);
    results.push(JSON.stringify(result));
    const record = targetedDryRun().last;
    if (record) records.push(record);
  }
  return { results, records };
}

test('edit corpus: content edits compile targeted and equal the full generation, every prediction covers what changed, and the results are byte-identical with the targeted rebuild off', async () => {
  const f = fixture();
  const off = await chain(f, corpus);
  expect(off.records).toEqual([]);
  expect(targetedDryRun().counters.generations).toBe(0);
  f.reset();
  rmSync(f.path('docs/sixth'), { recursive: true, force: true });
  f.write('ng-doc.config.ts', f.initial['ng-doc.config.ts']);
  f.write('tsconfig.json', f.initial['tsconfig.json']);
  rmSync(f.path('notes.txt'), { force: true });
  rmSync(f.path('docs/shared/fresh.md'), { force: true });
  const trace = path.join(f.root, 'trace.jsonl');
  verify = true;
  process.env[TARGETED_REBUILD_TRACE_ENV] = trace;
  const on = await chain(f, corpus);
  // Zero output change: every result, key order included, equals the flag-off chain's.
  expect(on.results).toEqual(off.results);
  // The initial generation has no committed index; every step is recorded.
  expect(on.records).toHaveLength(corpus.length);
  for (const [index, record] of on.records.entries()) {
    const step = corpus[index];
    expect({ step: step.name, misses: record.misses }).toEqual({ step: step.name, misses: [] });
    expect({ step: step.name, mismatch: record.mismatch }).toEqual({ step: step.name });
    // Path accounting: a step designated content really compiled targeted (and was published).
    expect(
      { step: step.name, path: record.path, published: record.published },
      record.reason,
    ).toEqual({
      step: step.name,
      path: step.expect,
      published: step.expect === 'content' ? 'targeted' : 'full',
    });
    if (record.path === 'content')
      expect(record.closure).toEqual(expect.arrayContaining(record.actual));
  }
  const byName = (name: string) => on.records[corpus.findIndex((step) => step.name === name)];
  // The heading/title rename relinks its consumers through K (the second page and the API page);
  // the include edit reaches both pages.
  const rename = byName('tab title rename that changes link text on another page');
  expect(rename.keys).toContain('*Guide');
  expect(rename.consumers).toBe(2);
  expect(rename.actual).toHaveLength(3);
  expect(byName('include edit').candidates.units).toBe(2);
  expect(byName('keyword add').keys).toContain('*Third');
  expect(byName('keyword consumer add').closure.length).toBe(1);
  // The delete batch of an atomic save is classified by the file's current state (it exists).
  expect(byName('atomic safe-write, delete batch').classes[0]).toMatchObject({
    kind: 'delete',
    class: 'content',
  });
  expect(byName('touch (same bytes)').actual).toEqual([]);
  expect(byName('demo .ts edit').classes[0].class).toBe('semantic');
  expect(byName('API JSDoc edit').classes[0].class).toBe('semantic');
  expect(byName('page title edit (entry module)').classes[0]).toMatchObject({
    class: 'entry',
    detail: 'evaluated description module',
    program: true,
  });
  // A page title edit re-describes only its own page (and relinks the consumers of its keys).
  expect(byName('page title edit (entry module)').actual).toHaveLength(1);
  expect(byName('page data edit read by its template').candidates.units).toBe(1);
  expect(byName('playground target component edit').classes[0]).toMatchObject({
    class: 'semantic',
    detail: 'program input',
  });
  expect(byName('playground target component edit').candidates.units).toBe(1);
  // The playground's input type lives in another file: its guide is reached (as a unit that read
  // the file, or through its refreshed semantic closure) and nothing else.
  expect(byName('playground input type edit in another file')).toMatchObject({
    candidates: { units: 1 },
  });
  expect(byName('playground input type edit in another file').actual).toHaveLength(1);
  // The retained index learned the file the previous generation's program added.
  expect(
    byName('edit of the file the demo imports since the last generation').classes[0],
  ).toMatchObject({ class: 'semantic', detail: 'program input', program: true });
  expect(byName('page add').classes.map((item) => item.class)).toContain('structural');
  expect(byName('page rename (folder move)').classes.map((item) => item.class)).toContain(
    'structural',
  );
  expect(byName('page delete').classes[0].class).toBe('structural');
  // The structural class: an added, moved or deleted page describes only itself (the navigation is
  // aggregated in full), and its entry comes or goes.
  expect(byName('page add').entries).toEqual({
    added: [expect.any(String)],
    removed: [],
  });
  expect(byName('page add').actual).toHaveLength(1);
  expect(byName('page rename (folder move)').entries).toEqual({
    added: [expect.any(String)],
    removed: [byName('page add').entries!.added[0]],
  });
  expect(byName('page rename (folder move)').actual).toHaveLength(2);
  expect(byName('page delete').entries).toEqual({
    added: [],
    removed: byName('page rename (folder move)').entries!.added,
  });
  // An API declaration's JSDoc edit describes that declaration (and the entry's own unit, whose
  // enumeration record changed), and relinks nothing else.
  expect(byName('API JSDoc edit').candidates.units).toBe(1);
  expect(byName('API JSDoc edit').actual).toHaveLength(1);
  // A guide's live API embeds: an edit of the embedded declaration (a program input outside the
  // API scope) re-renders that guide, through its fragments' semantic closures, and nothing else.
  for (const name of ['embedded declaration JSDoc edit', 'embedded declaration member type edit']) {
    expect(byName(name).classes[0], name).toMatchObject({ class: 'semantic' });
    expect(byName(name).candidates.units, name).toBe(1);
    expect(byName(name).actual, name).toHaveLength(1);
  }
  const resultOf = (name: string) => on.results[corpus.findIndex((step) => step.name === name) + 1];
  expect(resultOf('guide with live API embeds added')).toContain('The widget summary.');
  expect(resultOf('embedded declaration JSDoc edit')).toContain('The gadget summary.');
  expect(resultOf('embedded declaration JSDoc edit')).not.toContain('The widget summary.');
  // Behind a re-export: both guides that embed it are re-rendered, and nothing else.
  const behind = byName('embedded declaration edited behind a re-export');
  expect(behind.classes[0]).toMatchObject({ class: 'semantic' });
  expect(behind.actual).toHaveLength(2);
  expect(resultOf('embedded declaration edited behind a re-export')).toContain(
    'The sprocket summary.',
  );
  // Renamed or deleted, the embeds fail; restored or recreated, both guides render them again.
  expect(resultOf('embedded declaration restored')).toContain('The cog summary.');
  expect(resultOf('embedded file recreated')).toContain('The wheel summary.');
  expect(resultOf('embedded file recreated')).not.toContain('The cog summary.');
  // The keyword diff of units that come and go: a new page's export and a deleted page's are in
  // K, and a deleted consumer is not relinked (the second page is).
  expect(byName('page added with a keyword another guide links').keys).toContain('*Guide');
  const gone = byName('the page with the linked keyword is deleted');
  expect(gone.keys).toContain('*Guide');
  expect(gone.consumers).toBe(1);
  // A declaration no path reaches, dropped by the enumeration diff: its key is in K.
  const dropped = byName('the barrel drops the re-export');
  expect(dropped.keys).toContain('StarThing');
  // Its consumer (the third page) is relinked; the dropped unit itself is no consumer to link.
  expect(dropped.consumers).toBe(1);
  expect(dropped.closure).toEqual(expect.arrayContaining(dropped.actual));
  // The disambiguated key (`Actual--<suffix>`) of the declaration that leaves goes back.
  expect(byName('the same-name export leaves the scope').keys).toEqual(
    expect.arrayContaining([expect.stringMatching(/^Actual--/)]),
  );
  // An unknown path alone: nothing this generation observes again can read it.
  expect(byName('unknown path').reason).toMatch(/^unknown: not recorded by the committed build/);
  expect(byName('config edit').classes[0].class).toBe('config-toolchain');
  expect(byName('tsconfig edit').classes[0]).toMatchObject({
    class: 'config-toolchain',
    detail: 'program configuration',
  });
  expect(byName('unknown path').classes[0].class).toBe('unknown');
  // The keyword-loader pin decision is made before discovery, true exactly for the change sets
  // the targeted path may compile: content, evaluated entry inputs and existing program inputs.
  const targetable = (item: DryRunRecord['classes'][number], record: DryRunRecord) =>
    item.class === 'content' ||
    item.class === 'entry' ||
    (item.class === 'semantic' && item.detail === 'program input') ||
    (item.scoped === true &&
      (item.class !== 'unknown' ||
        record.classes.some((other) => ['entry', 'semantic', 'structural'].includes(other.class))));
  // After a failed generation the base has no committed index, so there are no retained loader
  // results to pin.
  const indexed = (record: DryRunRecord) => record.reason !== 'no committed index for this base';
  for (const record of on.records)
    expect(record.pin).toBe(
      indexed(record) && record.classes.every((item) => targetable(item, record)),
    );
  expect(
    corpus.filter((step, index) => step.fails === undefined && !indexed(on.records[index])),
  ).toEqual(corpus.filter((step, index) => index > 0 && corpus[index - 1].fails !== undefined));
  expect(targetedDryRun().counters).toMatchObject({ misses: 0, mismatches: 0, errors: 0 });
  // The trace carries one line per generation (the initial one included).
  const lines = readFileSync(trace, 'utf8').trim().split('\n');
  expect(lines).toHaveLength(corpus.length + 1);
  expect(JSON.parse(lines[0])).toMatchObject({ path: 'full', reason: 'origin none' });
}, 300_000);

test("a change nobody reported is found by the stat sweep, and the include's consumers are compiled", async () => {
  const f = fixture();
  verify = true;
  const service = f.create();
  await settle();
  const base = candidate(await generation(service, 1, undefined, []), 'initial');
  // A change nobody reports (no event) to the include, with an unrelated reported edit: the full
  // generation re-renders both consumers of the include; so must the targeted one.
  f.write('docs/shared/nested.md', 'Silently edited.');
  const reported = append(f, 'docs/third/index.md', '\nReported.\n');
  await settle();
  candidate(await generation(service, 2, base, [reported]), 'silent');
  const record = targetedDryRun().last!;
  expect(record).toMatchObject({ path: 'content', published: 'targeted', misses: [] });
  expect(record.mismatch).toBeUndefined();
  // The sweep finds the unreported include (and the reported page, written as well).
  expect(record.swept).toContain(f.path('docs/shared/nested.md'));
  expect(record.closure).toHaveLength(3);
  expect(record.actual).toHaveLength(3);
}, 120_000);

test('a targeted generation that differs from the full one is reported loudly, and the full result is published', async () => {
  const f = fixture();
  verify = true;
  const service = f.create();
  await settle();
  const base = candidate(await generation(service, 1, undefined, []), 'initial');
  // An injected closure fault: the one-hop consumers of a changed keyword are dropped, so the
  // page linking to the moved and renamed tab keeps its old link in the targeted result.
  vi.spyOn(UnitIndex.prototype, 'consumersOf').mockReturnValue(new Set());
  const rename = update(
    f.write(
      'docs/guide/index.md',
      f
        .read('docs/guide/index.md')
        .replace('keyword: Guide', 'keyword: Guide\nroute: intro\ntitle: Intro'),
    ),
  );
  await settle();
  const errors: string[] = [];
  const original = console.error;
  console.error = (message: string) => void errors.push(message);
  let result;
  try {
    result = await generation(service, 2, base, [rename]);
  } finally {
    console.error = original;
  }
  const record = targetedDryRun().last!;
  expect(record).toMatchObject({ path: 'content', published: 'full' });
  expect(record.mismatch).toMatch(/^\$\.candidate/);
  // Both consumers of the moved tab (the second page and the API page) are missed.
  expect(record.misses).toHaveLength(2);
  expect(targetedDryRun().counters).toMatchObject({ mismatches: 1, misses: 1 });
  expect(errors.join('\n')).toContain('COMPILATION_TARGETED_MISMATCH');
  // The published result is the full generation's: equal to a service with the rebuild off.
  vi.restoreAllMocks();
  verify = false;
  f.write('docs/guide/index.md', f.initial['docs/guide/index.md']);
  const off = f.create();
  await settle();
  const offBase = candidate(await generation(off, 1, undefined, []), 'off initial');
  f.write(
    'docs/guide/index.md',
    f
      .read('docs/guide/index.md')
      .replace('keyword: Guide', 'keyword: Guide\nroute: intro\ntitle: Intro'),
  );
  await settle();
  const reference = await generation(off, 2, offBase, [rename]);
  expect(JSON.stringify(result)).toBe(JSON.stringify(reference));
}, 120_000);

test('preconditions: failures, one-shot and reconcile generations are recorded as FULL; an unwritable trace is ignored', async () => {
  const f = fixture();
  verify = true;
  process.env[TARGETED_REBUILD_TRACE_ENV] = path.join(f.root, 'missing-directory', 'trace.jsonl');
  const service = f.create();
  await settle();
  const base = candidate(await generation(service, 1, undefined, []), 'initial');
  // A render error: no candidate. The committed entry (program and index) is restored.
  f.write('docs/third/index.md', '{% include "./missing.md" %}');
  await settle();
  const broken = await generation(service, 2, base, [update(f.path('docs/third/index.md'))]);
  expect(broken.candidate).toBeUndefined();
  // The targeted attempt failed; the full path decided the failure (the same diagnostics).
  expect(targetedDryRun().last).toMatchObject({ path: 'full', revision: null });
  expect(targetedDryRun().last?.reason).toMatch(/^targeted attempt failed: /);
  f.write('docs/third/index.md', f.initial['docs/third/index.md']);
  await settle();
  const repaired = candidate(
    await generation(service, 3, base, [update(f.path('docs/third/index.md'))]),
    'repair',
  );
  expect(targetedDryRun().last).toMatchObject({ path: 'content', misses: [], pending: 1 });
  // A reconcile generation (no filesystem origin).
  const reconcile = await service.compile(
    {
      generation: 4,
      mode: 'development',
      changes: [],
      previous: repaired,
      contentRequest: { origin: 'reconcile' },
    },
    new AbortController().signal,
    { lifetime: 'watch' },
  );
  candidate(reconcile, 'reconcile');
  expect(targetedDryRun().last?.reason).toBe('origin reconcile');
  // Not a watch generation (an in-process caller without context retains, but is not a watch).
  const noContext = await service.compile(
    {
      generation: 5,
      mode: 'development',
      changes: [update(f.path('docs/third/index.md'))],
      previous: reconcile.candidate!,
      contentRequest: { origin: 'filesystem' },
    },
    new AbortController().signal,
  );
  candidate(noContext, 'no context');
  expect(targetedDryRun().last?.reason).toBe('not a watch generation');
  // A base the committed index does not describe.
  await generation(service, 6, { ...base, revision: 'not-the-committed-revision' }, [
    update(f.path('docs/third/index.md')),
  ]);
  expect(targetedDryRun().last?.reason).toBe('no committed index for this base');
  // One-shot and production generations do not retain, so the dry run does not run.
  const before = targetedDryRun().counters.generations;
  await service.compile(
    { generation: 7, mode: 'production', changes: [] },
    new AbortController().signal,
  );
  expect(targetedDryRun().counters.generations).toBe(before);
}, 180_000);

test("a failed generation's other edits reach the next targeted generation (pending since its base)", async () => {
  // The session carries changes forward only from a superseded job. A generation that fails is
  // not superseded: when edits A and C arrive together, C breaks the page and the generation
  // fails, and the user then fixes only C, the next batch holds C alone. The full path re-renders
  // A anyway (it reads every input again); the targeted path adds the changes of every generation
  // against the same base that did not commit, so it compiles A's consumers too.
  const f = fixture();
  verify = true;
  const service = f.create();
  await settle();
  const base = candidate(await generation(service, 1, undefined, []), 'initial');
  const a = update(f.write('docs/shared/nested.md', 'Edit A.'));
  const c = update(f.write('docs/third/index.md', '{% include "./missing.md" %}'));
  await settle();
  const failed = await generation(service, 2, base, [a, c]);
  expect(failed.candidate).toBeUndefined();
  f.write('docs/third/index.md', f.initial['docs/third/index.md'] + '\nFixed C.\n');
  await settle();
  const fixed = candidate(await generation(service, 3, base, [c]), 'fix C only');
  const record = targetedDryRun().last!;
  expect(record).toMatchObject({ path: 'content', published: 'targeted', misses: [], pending: 2 });
  expect(record.mismatch).toBeUndefined();
  const consumers = ['guide', 'second'].map(
    (route) => fixed.artifacts.find((item) => item.routes.some((each) => each.path === route))!.id,
  );
  expect(record.closure).toEqual(expect.arrayContaining(consumers));
  expect(record.actual).toEqual(expect.arrayContaining(consumers));
}, 120_000);

test('the index lives in the retention entry: kept across a discarded commit, gone with a consumed program', async () => {
  const f = fixture();
  verify = true;
  const slot = createRuntimeRetention();
  const context = (): CompilationContext => {
    const value: CompilationContext = { lifetime: 'watch' };
    Object.defineProperty(value, 'retention', {
      value: slot.serve('acknowledged'),
      enumerable: false,
    });
    return value;
  };
  const service = f.create();
  const run = (number: number, previous: ArtifactSnapshot | undefined, changes: FileChange[]) =>
    service.compile(
      {
        generation: number,
        mode: 'development',
        changes,
        ...(previous ? { previous, contentRequest: { origin: 'filesystem' as const } } : {}),
      },
      new AbortController().signal,
      context(),
    );
  await settle();
  const base = candidate(await run(1, undefined, []), 'initial');
  slot.promote(base.revision);
  // Discarded commit: the working entry (and its index) is dropped, the committed one restored.
  f.write('docs/shared/nested.md', 'Discarded.');
  await settle();
  candidate(await run(2, base, [update(f.path('docs/shared/nested.md'))]), 'discarded');
  expect(targetedDryRun().last).toMatchObject({
    path: 'content',
    published: 'targeted',
    misses: [],
  });
  slot.promote(undefined);
  const guide = append(f, 'docs/guide/index.md', '\nAfter the discard.\n');
  await settle();
  const next = candidate(await run(3, base, [guide]), 'after discard');
  // The committed index served this generation. The discarded include edit is still on disk and
  // the full path re-renders the include's other consumer; the targeted path adds the changes of
  // the discarded generation against the same base, so it compiles that consumer as well.
  const record = targetedDryRun().last!;
  expect(record).toMatchObject({ path: 'content', published: 'targeted', misses: [], pending: 1 });
  expect(record.mismatch).toBeUndefined();
  expect(record.actual).toHaveLength(2);
  slot.promote(next.revision);
  // A consumed program (API edit) whose commit is discarded: no committed index remains.
  const api = update(
    f.write('docs/api.ts', '/** Consumed. */ export class Actual { /** Value. */ value = 1; }'),
  );
  await settle();
  candidate(await run(4, next, [api]), 'consumed');
  slot.promote(undefined);
  f.write('docs/api.ts', f.initial['docs/api.ts']);
  const third = append(f, 'docs/third/index.md', '\nAfter the consume.\n');
  await settle();
  candidate(await run(5, next, [update(f.path('docs/api.ts')), third]), 'after consume');
  expect(targetedDryRun().last?.reason).toBe('no committed index for this base');
}, 180_000);

test('a program file a guide embeds with a file= block reaches the guide: targeted with semantic closures, FULL without', async () => {
  // A scoped unit keeps the program files it read as its own dependencies, so the embedded file
  // reaches the guide that embeds it; without semantic closures `compact` drops that dependency
  // (the program owns it), and only the whole-program digest keeps the guide fresh, so a program
  // edit must go FULL.
  for (const scopedSemantic of [true, false]) {
    const f = fixture();
    verify = true;
    f.write('docs/embedded.ts', 'export const embedded = 1;\n');
    f.write(
      'docs/third/index.md',
      '# Third\n\n```typescript name="embedded.ts" file="../embedded.ts"\n\n```\n',
    );
    const service = f.create({ scopedSemantic });
    await settle();
    const base = candidate(await generation(service, 1, undefined, []), 'initial');
    // The guide renders the embedded program file.
    const third = base.artifacts.find((item) =>
      item.content.some((content) => content.html.includes('embedded')),
    )!;
    expect(third.routes.map((route) => route.path)).toContain('third');
    const edit = update(f.write('docs/embedded.ts', 'export const embedded = 2;\n'));
    await settle();
    const next = candidate(await generation(service, 2, base, [edit]), 'embedded edit');
    const record = targetedDryRun().last!;
    expect(record.classes).toEqual([
      expect.objectContaining({ class: 'semantic', detail: 'program input', program: true }),
    ]);
    expect(record.actual).toContain(third.id);
    expect(next.artifacts.find((item) => item.id === third.id)!.revision).not.toBe(third.revision);
    if (scopedSemantic) {
      expect(record).toMatchObject({ path: 'content', published: 'targeted', misses: [] });
      expect(record.mismatch).toBeUndefined();
      expect(record.closure).toEqual([third.id]);
    } else {
      expect(record.path).toBe('full');
      expect(record.reason).toBe(`semantic: program input (${f.path('docs/embedded.ts')})`);
    }
    for (const dispose of cleanup.splice(0).reverse()) await dispose();
    resetTargetedDryRun();
  }
}, 180_000);

test('a demo .ts edit is targeted on a patched program and on a new one', async () => {
  // A patched program is not the base's program: the replayed units' semantic closures are
  // refreshed against it, as they are against a program synchronized anew.
  for (const incrementalProgram of [true, false]) {
    const f = fixture();
    verify = true;
    const service = f.create({ incrementalProgram });
    await settle();
    const base = candidate(await generation(service, 1, undefined, []), 'initial');
    const edit = update(
      f.write(
        'docs/guide/demo.ts',
        f.read('docs/guide/demo.ts').replace("'fixture-demo'", "'fixture-demo-edited'"),
      ),
    );
    await settle();
    candidate(await generation(service, 2, base, [edit]), 'demo edit');
    expect(incrementalRetention().last?.synchronization?.path).toBe(
      incrementalProgram ? 'patched' : 'full',
    );
    const record = targetedDryRun().last!;
    expect(record).toMatchObject({ path: 'content', published: 'targeted', misses: [] });
    expect(record.mismatch).toBeUndefined();
    expect(record.actual).toHaveLength(1);
    for (const dispose of cleanup.splice(0).reverse()) await dispose();
    resetTargetedDryRun();
  }
}, 180_000);

test('a file created at an absent resolution candidate of a page that joins an API scope is targeted', async () => {
  // The page imports `../apix`, which resolves to a JSON file; discovery records the absent
  // `../apix.ts` candidate as an input of the page. Creating it changes what the page imports and
  // adds a declaration to the API scope (`docs/api*.ts`): the page is described again (its entry
  // changed), the program's resolution changed, and the API enumeration, which runs again, adds
  // the declaration's unit.
  const f = fixture();
  verify = true;
  f.write('docs/apix.json', JSON.stringify({ version: 1 }));
  f.write(
    'docs/third/ng-doc.page.ts',
    `import data from '../apix'; const page = { title: 'Third', route: 'third', mdFile: './index.md', data }; export default page;`,
  );
  const service = f.create();
  await settle();
  const base = candidate(await generation(service, 1, undefined, []), 'initial');
  expect(JSON.stringify(base)).not.toContain('ProbeDeclaration');
  const created = f.write(
    'docs/apix.ts',
    '/** Probe. */ export class ProbeDeclaration {}\nexport default { version: 2 };\n',
  );
  await settle();
  const next = candidate(
    await generation(service, 2, base, [{ kind: 'create', path: created }]),
    'probe created',
  );
  const record = targetedDryRun().last!;
  expect(record.classes[0]).toMatchObject({
    class: 'semantic',
    detail: expect.stringContaining('changes membership of glob'),
  });
  expect(record).toMatchObject({ path: 'content', published: 'targeted', misses: [] });
  expect(record.mismatch).toBeUndefined();
  expect(JSON.stringify(next)).toContain('ProbeDeclaration');
}, 180_000);

const SEEDS = [0x5eed01, 0x5eed02, 0x5eed03];
const STEPS = Number(process.env['S2_SEEDED_STEPS'] ?? 60);

test.each(SEEDS)(
  'seeded verify differential, seed %i: targeted equals full, 0 misses, content steps targeted',
  async (seed) => {
    const f = fixture(seed === SEEDS[1]);
    verify = true;
    const trace = process.env['S2_SEEDED_TRACE'];
    if (trace) process.env[TARGETED_REBUILD_TRACE_ENV] = `${trace}-${seed.toString(16)}.jsonl`;
    const steps = seededSteps(seed, STEPS);
    const { records } = await chain(f, steps);
    expect(records).toHaveLength(steps.length);
    const wrongPath: string[] = [];
    for (const [index, record] of records.entries()) {
      expect({ step: index, name: steps[index].name, misses: record.misses }).toEqual({
        step: index,
        name: steps[index].name,
        misses: [],
      });
      if (record.mismatch !== undefined)
        wrongPath.push(`${index} ${steps[index].name}: mismatch at ${record.mismatch}`);
      if (steps[index].expect === 'content' && record.published !== 'targeted')
        wrongPath.push(`${index} ${steps[index].name}: ${record.reason}`);
      if (steps[index].expect === 'full') expect(record.path, steps[index].name).toBe('full');
    }
    expect(wrongPath).toEqual([]);
    expect(targetedDryRun().counters).toMatchObject({ misses: 0, mismatches: 0, errors: 0 });
  },
  300_000,
);
