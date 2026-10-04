import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGeneratorBuildSession, TARGETED_REBUILD_ENV } from '..';

/** The factory options bootstrap gives the worker compiler (the worker service itself stays real). */
const factories = vi.hoisted(() => [] as unknown[]);
vi.mock('../../worker', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../worker')>();
  return {
    ...actual,
    createWorkerCompilationService: (
      ...args: Parameters<typeof actual.createWorkerCompilationService>
    ) => {
      factories.push(args[0].factoryOptions);
      return actual.createWorkerCompilationService(...args);
    },
  };
});

const workspace = path.resolve('/tmp/ng-doc-targeted-rebuild-verify');
function session() {
  return createGeneratorBuildSession({
    projectId: 'project',
    workspaceRoot: workspace,
    defaults: {
      docsRoot: path.join(workspace, 'docs'),
      tsConfig: path.join(workspace, 'tsconfig.json'),
      outputRoot: path.join(workspace, 'output'),
      cacheRoot: path.join(workspace, 'cache'),
    },
    templateRoot: workspace,
  });
}

describe('NGDOC_TARGETED_REBUILD: the compiler gets the targeted rebuild option', () => {
  const original = process.env[TARGETED_REBUILD_ENV];
  afterEach(() => {
    if (original === undefined) delete process.env[TARGETED_REBUILD_ENV];
    else process.env[TARGETED_REBUILD_ENV] = original;
    factories.splice(0);
  });

  it('passes nothing (on) by default, false for 0/false/off/no, and verify for verify', async () => {
    const warn = vi.spyOn(process, 'emitWarning').mockImplementation(() => {});
    const cases: Array<[string | undefined, boolean | 'verify' | undefined]> = [
      [undefined, undefined],
      ['1', undefined],
      ['on', undefined],
      ['maybe', undefined],
      ['0', false],
      ['OFF', false],
      ['verify', 'verify'],
      [' Verify ', 'verify'],
    ];
    try {
      for (const [value, expected] of cases) {
        if (value === undefined) delete process.env[TARGETED_REBUILD_ENV];
        else process.env[TARGETED_REBUILD_ENV] = value;
        const built = session();
        await built.dispose();
        const options = factories.at(-1) as Record<string, unknown>;
        expect({ value, option: options['targetedRebuild'] }).toEqual({ value, option: expected });
        if (expected === undefined) expect('targetedRebuild' in options).toBe(false);
      }
    } finally {
      warn.mockRestore();
    }
  });
});
