import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGeneratorBuildSession, PARALLEL_WRITES_ENV } from '..';

/** The options bootstrap gives the candidate committer (the committer itself stays real). */
const created = vi.hoisted(() => [] as unknown[]);
vi.mock('../candidate-output-committer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../candidate-output-committer')>();
  return {
    ...actual,
    createCandidateOutputCommitter: (
      ...args: Parameters<typeof actual.createCandidateOutputCommitter>
    ) => {
      created.push(args[0]);
      return actual.createCandidateOutputCommitter(...args);
    },
  };
});

const workspace = path.resolve('/tmp/ng-doc-parallel-writes-switch');
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

describe('NGDOC_PARALLEL_WRITES: the parallel output writes kill switch', () => {
  const original = process.env[PARALLEL_WRITES_ENV];
  afterEach(() => {
    if (original === undefined) delete process.env[PARALLEL_WRITES_ENV];
    else process.env[PARALLEL_WRITES_ENV] = original;
    delete process.env['NGDOC_TARGETED_REBUILD'];
    created.splice(0);
  });

  it('keeps parallel writes on when unset or on; 0/false/off/no turn them off', async () => {
    const warn = vi.spyOn(process, 'emitWarning').mockImplementation(() => {});
    try {
      const cases: Array<[string | undefined, unknown]> = [
        [undefined, {}],
        ['1', {}],
        ['yes', {}],
        ['0', { parallelWrites: false }],
        ['false', { parallelWrites: false }],
        ['OFF', { parallelWrites: false }],
        ['no', { parallelWrites: false }],
        ['verify', {}],
      ];
      for (const [value, expected] of cases) {
        if (value === undefined) delete process.env[PARALLEL_WRITES_ENV];
        else process.env[PARALLEL_WRITES_ENV] = value;
        const built = session();
        await built.dispose();
        expect({ value, options: created.at(-1) }).toEqual({ value, options: expected });
      }
      // It has no verify mode: that value is reported once, under its own code, and leaves the
      // writes parallel.
      expect(warn).toHaveBeenCalledOnce();
      expect(String(warn.mock.calls[0][0])).toContain('NGDOC_PARALLEL_WRITES="verify"');
      expect(warn.mock.calls[0][1]).toEqual({ code: 'NGDOC_PARALLEL_WRITES_VALUE' });

      // Independent of the targeted rebuild's switch, which turns delta commits off.
      process.env[PARALLEL_WRITES_ENV] = '0';
      process.env['NGDOC_TARGETED_REBUILD'] = '0';
      await session().dispose();
      expect(created.at(-1)).toEqual({ delta: false, parallelWrites: false });
    } finally {
      warn.mockRestore();
    }
  });
});
