import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';

import type { CompilationResult } from '../contracts';
import { TRACKED_PROGRAM_REUSE_FLAG } from '../kernel/flags';
import * as observations from '../semantic/program-observations';
import { resetIncrementalRetention, resetTargetedDryRun } from './index';
import {
  type Fixture,
  candidate,
  cleanup,
  EMBED_GUIDE,
  embeddedWidget,
  fixture,
  generation,
  page,
  settle,
  update,
} from './testing/targeted-corpus';

// Whole-program tracking reuse (`NGDOC_TRACKED_PROGRAM_REUSE`): every API embed of a generation
// that is not scoped depends on the whole program, which is tracked once per program of the
// generation instead of once per embed. Results must be byte-identical with the switch off, and
// with a cold build.

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
  resetIncrementalRetention();
  resetTargetedDryRun();
});

/**
 * Guides that embed declarations in the program, in the API scope, and outside the program.
 * @param root The fixture's root.
 */
const embeds = (root: string): Record<string, string> => {
  writeFileSync(path.join(root, 'outside.ts'), '/** Outside doc. */\nexport class Outside {}\n');
  return {
    'docs/embed/widget.ts': embeddedWidget('Widget', 'number'),
    'docs/embed/ng-doc.page.ts': page('Embed', 'embed'),
    'docs/embed/index.md': EMBED_GUIDE,
    'docs/many/ng-doc.page.ts': page('Many', 'many'),
    'docs/many/index.md': [
      '# Many',
      '{{ NgDocApi.api("docs/embed/widget.ts#Widget") }}',
      '{{ NgDocApi.details("docs/api.ts#Actual") }}',
      '{{ JSDoc.description("docs/play/box.ts#Box") }}',
      // Outside the program: the query adds the file, and the program is created again.
      '{{ JSDoc.description("outside.ts#Outside") }}',
      '{{ NgDocApi.api("docs/api.ts#Actual") }}',
    ].join('\n\n'),
  };
};

/**
 * Compiles `f` once in `mode`, with the reuse on or off, and counts the program trackings.
 * @param f The fixture.
 * @param mode The generation's mode.
 * @param reuse Whether the tracking is reused.
 */
async function compile(
  f: Fixture,
  mode: 'production' | 'development',
  reuse: boolean,
): Promise<{ result: string; trackings: number }> {
  if (!reuse) vi.stubEnv(TRACKED_PROGRAM_REUSE_FLAG, '0');
  const track = vi.spyOn(observations, 'trackProgram');
  const service = f.create({ scopedSemantic: false, targetedRebuild: false });
  await settle();
  const result: CompilationResult = await service.compile(
    { generation: 1, mode, changes: [] },
    new AbortController().signal,
    { lifetime: 'generation' },
  );
  candidate(result, `${mode} ${reuse ? 'on' : 'off'}`);
  const trackings = track.mock.calls.length;
  track.mockRestore();
  vi.unstubAllEnvs();
  await service.dispose();
  return { result: JSON.stringify(result), trackings };
}

test.each(['production', 'development'] as const)(
  'a %s generation tracks each program once for all embeds, byte-identical with the switch off',
  async (mode) => {
    const f = fixture(false, {}, embeds);
    const on = await compile(f, mode, true);
    const off = await compile(f, mode, false);
    expect(on.result).toBe(off.result);
    expect(on.result).toContain('The widget summary.');
    expect(on.result).toContain('Outside doc.');
    // Off: one tracking per whole-program query (the three embeds of the first guide, the five of
    // the second). On: one for the program, one for the program the outside file re-created.
    expect(off.trackings).toBe(8);
    expect(on.trackings).toBe(2);
  },
);

test('a development chain without scoping: an embedded declaration edit equals the switch off and a cold build', async () => {
  const f = fixture(false, {}, embeds);
  const chain = async (reuse: boolean) => {
    f.reset();
    if (!reuse) vi.stubEnv(TRACKED_PROGRAM_REUSE_FLAG, '0');
    const service = f.create({ scopedSemantic: false });
    await settle();
    const first = candidate(await generation(service, 1, undefined, []), 'initial');
    const edit = update(f.write('docs/embed/widget.ts', embeddedWidget('Gadget', 'string')));
    await settle();
    const second = await generation(service, 2, first, [edit]);
    candidate(second, 'edit');
    const cold = f.create({ scopedSemantic: false });
    const fresh = await cold.compile(
      { generation: 1, mode: 'development', changes: [] },
      new AbortController().signal,
      { lifetime: 'generation' },
    );
    vi.unstubAllEnvs();
    return { second, fresh };
  };
  const on = await chain(true);
  const off = await chain(false);
  const outputs = (result: CompilationResult) =>
    JSON.stringify(result.candidate?.artifacts.map((artifact) => artifact.outputs));
  expect(outputs(on.second)).toContain('The gadget summary.');
  expect(outputs(on.second)).toBe(outputs(off.second));
  expect(outputs(on.second)).toBe(outputs(on.fresh));
}, 120_000);
