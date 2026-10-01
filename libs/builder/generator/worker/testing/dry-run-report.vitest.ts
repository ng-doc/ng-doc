import { build } from 'esbuild';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';

import { createWorkerCompilationService } from '../index';

/**
 * The long-lived runtime's output is not forwarded, so the targeted rebuild's report would say
 * where nobody sees it that a `verify` generation missed a unit or differed from the full one.
 * The runtime returns each new record with its compile's reply; the host counts it, warns on a
 * miss or a mismatch, and remembers which results came from a targeted generation.
 */
let root: string;
let entryUrl: URL;
let moduleUrl: URL;

beforeAll(async () => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'ngdoc-dry-run-report-')));
  const repository = resolve(import.meta.dirname, '../../../../..');
  await build({
    entryPoints: [
      join(repository, 'libs/builder/generator/worker/entry.ts'),
      join(repository, 'libs/builder/generator/worker/protocol.ts'),
    ],
    outdir: join(root, 'worker'),
    platform: 'node',
    format: 'esm',
    target: 'node24',
  });
  entryUrl = pathToFileURL(join(root, 'worker/entry.js'));
  // A stand-in compilation module with the dry-run report export: generation 2 misses a unit,
  // generation 3 runs no dry run at all.
  const module = join(root, 'compiler.mjs');
  writeFileSync(
    module,
    `let generations = 0;
let last;
export function targetedDryRun() {
  return { counters: { generations }, ...(last ? { last } : {}) };
}
export function createCompilationService() {
  return {
    async compile(request) {
      if (request.generation !== 3) {
        generations++;
        last = { generation: request.generation, path: 'content', misses: request.generation === 2 ? ['unit-b'] : [] };
        if (request.generation === 4) last.published = 'targeted';
        if (request.generation === 5) Object.assign(last, { published: 'full', mismatch: '$.candidate.revision' });
      }
      return { dependencies: [], diagnostics: [], whyRebuilt: [] };
    },
    async dispose() {},
  };
}
`,
  );
  moduleUrl = pathToFileURL(module);
}, 60_000);

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

it('reports the dry-run records a long-lived runtime returns, and warns on a miss', async () => {
  const warn = vi.spyOn(process, 'emitWarning').mockImplementation(() => {});
  const compiler = createWorkerCompilationService({
    moduleUrl,
    workerEntryUrl: entryUrl,
    startupTimeoutMs: 30_000,
    compileTimeoutMs: 30_000,
    persistent: { delta: false, prime: false },
  });
  try {
    for (const generation of [1, 2, 3]) {
      const result = await compiler.compile(
        { generation, mode: 'development', changes: [] },
        new AbortController().signal,
        { lifetime: 'watch' },
      );
      // The record never enters the result.
      expect(result).toEqual({ dependencies: [], diagnostics: [], whyRebuilt: [] });
      expect(compiler.targetedResult(result)).toBe(false);
    }
    expect(compiler.targetedDryRun()).toEqual({
      records: 2,
      misses: 1,
      last: { generation: 2, path: 'content', misses: ['unit-b'] },
    });
    // A targeted result may be committed as a delta; the host knows it from the record only.
    const targeted = await compiler.compile(
      { generation: 4, mode: 'development', changes: [] },
      new AbortController().signal,
      { lifetime: 'watch' },
    );
    expect(compiler.targetedResult(targeted)).toBe(true);
    expect(compiler.targetedResult({ ...targeted })).toBe(false);
    // A `verify` mismatch: the full result was published, and the host warns.
    const mismatched = await compiler.compile(
      { generation: 5, mode: 'development', changes: [] },
      new AbortController().signal,
      { lifetime: 'watch' },
    );
    expect(compiler.targetedResult(mismatched)).toBe(false);
    expect(compiler.targetedDryRun()).toMatchObject({ records: 4, misses: 2 });
    const mismatches = warn.mock.calls.filter(
      ([, options]) => (options as { code?: string })?.code === 'COMPILATION_TARGETED_MISMATCH',
    );
    expect(mismatches).toHaveLength(2);
    expect(String(mismatches[0][0])).toContain('generation 2 changed 1 unit(s)');
    expect(String(mismatches[1][0])).toContain(
      'generation 5 differs from the full generation at $.candidate.revision',
    );
  } finally {
    warn.mockRestore();
    await compiler.dispose();
  }
}, 60_000);
