import { afterEach, describe, expect, it } from 'vitest';

import type {
  ArtifactSnapshot,
  CompilationRequest,
  CompilationRetention,
  Dependency,
  RetainedCompilation,
  RetainedSemanticState,
  SemanticProgramSynchronization,
} from '../contracts';
import { dependencyKey, uniqueDependencies } from './common';
import type { CompilationOptions } from './index';
import {
  type RetainedGeneration,
  GenerationRetention,
  incrementalRetention,
  resetIncrementalRetention,
} from './retention';

const options = {
  projectId: 'project',
  workspaceRoot: '/workspace',
  defaults: {},
  compilerVersion: 'test',
  toolchainDigest: 'test',
} as unknown as CompilationOptions;

const request = (revision: string): CompilationRequest => ({
  generation: 2,
  mode: 'development',
  changes: [{ kind: 'update', path: '/workspace/src/a.ts' }],
  previous: { projectId: 'project', revision } as ArtifactSnapshot,
});

/** A committed-entry slot that records what the retention hands back. */
function slot() {
  let held: RetainedCompilation | undefined;
  const restored: RetainedCompilation[] = [];
  const invalidated: string[] = [];
  const port: CompilationRetention = {
    take() {
      const entry = held;
      held = undefined;
      return entry;
    },
    offer(entry: RetainedCompilation) {
      held = entry;
    },
    restore(entry: RetainedCompilation) {
      restored.push(entry);
      return true;
    },
    invalidate(reason: string) {
      invalidated.push(reason);
    },
    held: () => (held ? { committed: (held as RetainedGeneration).base } : {}),
  };
  return { port, restored, invalidated };
}

/**
 * One generation against a committed entry whose program is `taken`, ended with `outcome`.
 * @param outcome
 * @param retained
 * @param candidate
 */
function generation(
  outcome: SemanticProgramSynchronization,
  retained: RetainedSemanticState | undefined,
  candidate?: string,
) {
  const taken: RetainedSemanticState = { retained: true };
  const { port, restored, invalidated } = slot();
  const seed = new GenerationRetention(options, request('base'), {
    lifetime: 'watch',
    retention: port,
  });
  seed.synchronized({ path: 'full', reason: 'no retained program' }, { outcome: 'full' });
  seed.finish(() => taken, 'base');
  const retention = new GenerationRetention(options, request('base'), {
    lifetime: 'watch',
    retention: port,
  });
  const semantic = retention.semanticRetention(request('base'), 'project');
  expect(semantic?.previous).toBe(taken);
  const counters = { stamped: 0, rehashed: 1, probed: 0, listed: 0, relisted: 0 };
  const path =
    outcome.outcome === 'full'
      ? { path: 'full' as const, reason: outcome.reason ?? 'changed' }
      : outcome.outcome === 'reused'
        ? { path: 'reused' as const, ...counters }
        : {
            path: 'patched' as const,
            files: ['/workspace/src/a.ts'],
            ...(outcome.outcome === 'patched-failed' ? { failed: true as const } : {}),
            ...counters,
          };
  retention.synchronized(path, outcome);
  retention.finish(() => retained, candidate, {}, request('base').changes);
  return { taken, restored, invalidated, held: port.held() };
}

afterEach(() => resetIncrementalRetention());

describe('the program retention port in the retention slot', () => {
  it('restores the taken program itself after a patched-failed synchronization', () => {
    const handedBack: RetainedSemanticState = { retained: true };
    const { restored, invalidated } = generation(
      { outcome: 'patched-failed', handedBack },
      undefined,
    );
    expect(invalidated).toEqual([]);
    expect(restored).toHaveLength(1);
    expect((restored[0] as RetainedGeneration).semantic).toBe(handedBack);
    expect((restored[0] as RetainedGeneration).base).toBe('base');
    expect((restored[0] as RetainedGeneration).pending).toEqual(request('base').changes);
    expect(incrementalRetention().counters).toMatchObject({ reused: 1, restored: 1 });
  });

  it('keeps a reused program for the taken base too', () => {
    const kept: RetainedSemanticState = { retained: true };
    const { restored, invalidated, held } = generation({ outcome: 'reused' }, kept, 'next');
    expect(invalidated).toEqual([]);
    expect((restored[0] as RetainedGeneration).semantic).toBe(kept);
    expect(held).toEqual({ committed: 'next' });
  });

  it('offers a patched program for its candidate only, never for the taken base', () => {
    const kept: RetainedSemanticState = { retained: true };
    // A candidate: the patched program is offered for it, and the taken base loses its program.
    const offered = generation({ outcome: 'patched' }, kept, 'next');
    expect(offered.restored).toEqual([]);
    expect(offered.invalidated).toEqual(['patched']);
    expect(offered.held).toEqual({ committed: 'next' });
    expect(incrementalRetention().counters).toMatchObject({ reused: 1, promoted: 2 });
    // No candidate (a later phase failed or the generation was aborted): nothing keeps it.
    const dropped = generation({ outcome: 'patched' }, kept);
    expect(dropped.restored).toEqual([]);
    expect(dropped.invalidated).toEqual(['patched']);
    expect(dropped.held).toEqual({});
  });

  it('drops the taken program after a full synchronization', () => {
    const { restored, invalidated } = generation(
      { outcome: 'full', reason: 'content observation changed' },
      { retained: true },
    );
    expect(restored).toEqual([]);
    expect(invalidated).toEqual(['consumed']);
    expect(incrementalRetention().last).toMatchObject({ discarded: 'content observation changed' });
  });

  it('drops a patched-failed program that was not handed back', () => {
    const { restored, invalidated } = generation({ outcome: 'patched-failed' }, undefined);
    expect(restored).toEqual([]);
    expect(invalidated).toEqual(['consumed']);
  });
});

describe('dependency keys of the non-physical kinds', () => {
  it('keeps one closure per scope and key and one evaluated digest per entry', () => {
    const dependencies: Dependency[] = [
      { kind: 'semantic-closure', scopeId: 'program', key: 'unit-b', digest: 'one' },
      { kind: 'semantic-closure', scopeId: 'program', key: 'unit-a', digest: 'one' },
      { kind: 'semantic-closure', scopeId: 'program', key: 'unit-a', digest: 'two' },
      { kind: 'evaluated', entryId: 'entry', digest: 'one' },
      { kind: 'evaluated', entryId: 'entry', digest: 'two' },
      { kind: 'semantic-reference', scopeId: 'program', digest: 'one', reason: 'program' },
    ];
    expect(dependencies.map(dependencyKey)).toEqual([
      'semantic-closure:program:unit-b',
      'semantic-closure:program:unit-a',
      'semantic-closure:program:unit-a',
      'evaluated:entry',
      'evaluated:entry',
      'semantic-reference:program',
    ]);
    expect(uniqueDependencies(dependencies)).toEqual([
      dependencies[4],
      dependencies[2],
      dependencies[0],
      dependencies[5],
    ]);
  });
});
