import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Dependency } from '../../contracts';
import { createDependencyRefresher } from '..';

interface Measurement {
  mode: 'fresh-refresher-per-call' | 'generation-refresher';
  durationMs: number;
  observations: number;
  refreshes: number;
  files: number;
}

describe('generation dependency refresh performance', () => {
  let temporaryRoot: string;
  let dependencies: Dependency[];

  beforeAll(() => {
    temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-doc-graph-performance-'));
    dependencies = Array.from({ length: 100 }, (_, index) => {
      const file = path.join(temporaryRoot, `${String(index).padStart(3, '0')}.txt`);
      fs.writeFileSync(file, Buffer.alloc(1024, index));
      return { kind: 'content', path: file, digest: 'stale' };
    });
  });

  afterAll(() => {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  });

  it('observes 100 shared files once across 100 refreshes in two real filesystem runs', async () => {
    const runs = [];
    for (let run = 0; run < 2; run += 1) {
      const fresh = await measureFresh(dependencies, 100);
      const generation = await measureGeneration(dependencies, 100);
      expect(fresh.observations).toBe(10_000);
      expect(generation.observations).toBe(100);
      expect(generation.durationMs).toBeLessThan(fresh.durationMs);
      runs.push({ run: run + 1, fresh, generation });
    }

    const output = process.env['NG_DOC_GRAPH_PERF_OUTPUT'];
    if (output) {
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(
        output,
        `${JSON.stringify(
          {
            workload: { files: 100, refreshes: 100, contentBytesPerFile: 1024 },
            runs,
          },
          null,
          2,
        )}\n`,
      );
    }
  });
});

async function measureFresh(dependencies: Dependency[], refreshes: number): Promise<Measurement> {
  let observations = 0;
  const started = performance.now();
  for (let index = 0; index < refreshes; index += 1) {
    await createDependencyRefresher({ onObserve: () => (observations += 1) }).refresh(
      dependencies,
      [],
    );
  }
  return {
    mode: 'fresh-refresher-per-call',
    durationMs: round(performance.now() - started),
    observations,
    refreshes,
    files: dependencies.length,
  };
}

async function measureGeneration(
  dependencies: Dependency[],
  refreshes: number,
): Promise<Measurement> {
  let observations = 0;
  const refresher = createDependencyRefresher({ onObserve: () => (observations += 1) });
  const started = performance.now();
  for (let index = 0; index < refreshes; index += 1) {
    await refresher.refresh(dependencies, []);
  }
  return {
    mode: 'generation-refresher',
    durationMs: round(performance.now() - started),
    observations,
    refreshes,
    files: dependencies.length,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
