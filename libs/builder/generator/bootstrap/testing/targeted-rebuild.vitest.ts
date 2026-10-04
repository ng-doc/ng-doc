import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGeneratorBuildSession, TARGETED_REBUILD_ENV } from '..';

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

const workspace = path.resolve('/tmp/ng-doc-targeted-rebuild-switch');
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

describe('NGDOC_TARGETED_REBUILD: the delta commit kill switch', () => {
  const original = process.env[TARGETED_REBUILD_ENV];
  afterEach(() => {
    if (original === undefined) delete process.env[TARGETED_REBUILD_ENV];
    else process.env[TARGETED_REBUILD_ENV] = original;
    created.splice(0);
  });

  it('keeps delta commits on when unset, on, or verify; 0/false/off/no turn them off', async () => {
    const warn = vi.spyOn(process, 'emitWarning').mockImplementation(() => {});
    try {
      const cases: Array<[string | undefined, unknown]> = [
        [undefined, {}],
        ['1', {}],
        ['on', {}],
        ['verify', {}],
        ['0', { delta: false }],
        ['false', { delta: false }],
        ['OFF', { delta: false }],
        ['no', { delta: false }],
        ['maybe', {}],
      ];
      for (const [value, expected] of cases) {
        if (value === undefined) delete process.env[TARGETED_REBUILD_ENV];
        else process.env[TARGETED_REBUILD_ENV] = value;
        const built = session();
        await built.dispose();
        expect({ value, options: created.at(-1) }).toEqual({ value, options: expected });
      }
      // An unrecognised value is reported once and leaves delta commits on.
      expect(warn).toHaveBeenCalledOnce();
      expect(String(warn.mock.calls[0][0])).toContain('NGDOC_TARGETED_REBUILD="maybe"');
      // Under its own code, not the persistent worker's.
      expect(warn.mock.calls[0][1]).toEqual({ code: 'NGDOC_TARGETED_REBUILD_VALUE' });
    } finally {
      warn.mockRestore();
    }
  });
});
