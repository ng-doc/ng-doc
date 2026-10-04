import { build } from 'esbuild';
import type { ForkOptions } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';

import { type PersistentWorkerOptions, createWorkerCompilationService } from '../index';

/**
 * The delta transport sends its JSON text over an `advanced` channel; with the delta transport off
 * (`NGDOC_DELTA_TRANSPORT=0` → `delta: false`) the long-lived runtime keeps the `json` channel, and
 * one-shot runtimes always use `json`.
 */
const forks = vi.hoisted(() => [] as Array<ForkOptions | undefined>);
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    fork: (...args: Parameters<typeof actual.fork>) => {
      forks.push(args[2] as ForkOptions | undefined);
      return actual.fork(...args);
    },
  };
});

let temporary: string;
let entryUrl: URL;
let moduleUrl: URL;
beforeAll(async () => {
  temporary = await mkdtemp(path.join(tmpdir(), 'ngdoc-channel-'));
  await writeFile(path.join(temporary, 'package.json'), '{"type":"module"}');
  await build({
    entryPoints: [
      path.resolve(import.meta.dirname, '../entry.ts'),
      path.resolve(import.meta.dirname, '../protocol.ts'),
    ],
    outdir: temporary,
    platform: 'node',
    format: 'esm',
    target: 'node24',
  });
  entryUrl = pathToFileURL(path.join(temporary, 'entry.js'));
  const factory = path.join(temporary, 'factory.mjs');
  await writeFile(
    factory,
    `export function createCompilationService() { return { async compile() { return { dependencies: [], diagnostics: [], whyRebuilt: [], candidate: { projectId: 'p', revision: 'r', artifacts: [], globalKeywords: [], remoteKeywords: [] } }; }, async dispose() {} }; }`,
  );
  moduleUrl = pathToFileURL(factory);
});
afterAll(async () => {
  await rm(temporary, { recursive: true, force: true });
});

it.each([
  ['delta transport', {}, ['advanced', 'json']],
  ['delta transport off', { delta: false }, ['json', 'json']],
] as Array<[string, PersistentWorkerOptions, string[]]>)(
  'uses the channel of the transport (%s)',
  async (_label, persistent, expected) => {
    forks.splice(0);
    const service = createWorkerCompilationService({
      moduleUrl,
      workerEntryUrl: entryUrl,
      persistent,
    });
    const request = { generation: 1, mode: 'development' as const, changes: [] };
    const watch = await service.compile(request, new AbortController().signal, {
      lifetime: 'watch',
      delta: true,
    });
    const once = await service.compile(request, new AbortController().signal);
    expect([watch.candidate?.revision, once.candidate?.revision]).toEqual(['r', 'r']);
    expect(forks.map((options) => options?.serialization)).toEqual(expected);
    await service.dispose();
  },
);
