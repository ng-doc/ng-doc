import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CommitRequest, PublishedGeneratorConfiguration } from '../../contracts';
import { createCandidateOutputCommitter } from '../candidate-output-committer';
import { configuration, snapshot } from './fixtures';

describe('candidate-aware output committer', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-doc-bootstrap-commit-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('rejects legacy candidates and calls after disposal without touching the filesystem', async () => {
    const mutations: string[] = [];
    const committer = createCandidateOutputCommitter({
      beforeMutation: (operation) => {
        mutations.push(operation);
      },
    });
    expect(await commit(committer, request(snapshot(undefined)))).toEqual({
      status: 'failed',
      diagnostics: [expect.objectContaining({ code: 'BOOTSTRAP_CONFIGURATION_INVALID' })],
    });
    expect(mutations).toEqual([]);
    expect(fs.readdirSync(root)).toEqual([]);

    await committer.dispose();
    await committer.dispose();
    expect(await commit(committer, request(snapshot(configuration(root))))).toEqual({
      status: 'failed',
      diagnostics: [expect.objectContaining({ code: 'BOOTSTRAP_DISPOSED' })],
    });
  });

  it('binds only a committed first candidate and permits recovery at another root', async () => {
    const firstRoot = path.join(root, 'first');
    const secondRoot = path.join(root, 'second');
    const committer = createCandidateOutputCommitter();
    const stale = await committer.commit(
      request(snapshot(configuration(firstRoot))),
      { isCurrent: () => false },
      new AbortController().signal,
    );
    expect(stale.status).toBe('stale');
    expect(fs.existsSync(path.join(firstRoot, 'output', 'content.txt'))).toBe(false);

    const invalid = snapshot(configuration(firstRoot));
    invalid.artifacts[0].outputs[0].digest = 'invalid';
    expect((await commit(committer, request(invalid))).status).toBe('failed');

    const result = await commit(committer, request(snapshot(configuration(secondRoot))));
    expect(result.status).toBe('committed');
    expect(fs.readFileSync(path.join(secondRoot, 'output', 'content.txt'), 'utf8')).toBe(
      'generated',
    );
    await committer.dispose();
  });

  it('passes same-root manifests and updates through while rejecting restart fields', async () => {
    const mutations: string[] = [];
    const committer = createCandidateOutputCommitter({
      beforeMutation: (operation) => {
        mutations.push(operation);
      },
    });
    const initialConfig = configuration(root);
    const initial = await commit(committer, request(snapshot(initialConfig)));
    if (initial.status !== 'committed') throw new Error('Expected initial commit');

    const updatedConfig = {
      ...initialConfig,
      themes: { light: 'light-two', dark: 'dark-two' },
      digest: 'configuration-two',
    };
    const updated = await commit(
      committer,
      request(snapshot(updatedConfig, 'updated', 'revision-two'), 2, initial.manifest),
    );
    expect(updated.status).toBe('committed');
    expect(fs.readFileSync(path.join(initialConfig.outputRoot, 'content.txt'), 'utf8')).toBe(
      'updated',
    );

    for (const [field, value] of [
      ['outputRoot', path.join(root, 'other-output')],
      ['cacheRoot', path.join(root, 'other-cache')],
      ['assetDirectory', 'other-assets'],
    ] as const) {
      const before = [...mutations];
      const changed = { ...updatedConfig, [field]: value, digest: `changed-${field}` };
      const result = await commit(
        committer,
        request(snapshot(changed, 'forbidden', `revision-${field}`), 3, initial.manifest),
      );
      expect(result).toEqual({
        status: 'failed',
        diagnostics: [
          expect.objectContaining({
            code: 'BOOTSTRAP_RESTART_REQUIRED',
            message: expect.stringContaining(field),
          }),
        ],
      });
      expect(mutations).toEqual(before);
      expect(fs.readFileSync(path.join(initialConfig.outputRoot, 'content.txt'), 'utf8')).toBe(
        'updated',
      );
    }
    await committer.dispose();
  });

  it('admits cloned current configurations before mutation and preserves published bytes on refusal', async () => {
    let reject = false;
    const mutations: string[] = [];
    const committer = createCandidateOutputCommitter(
      {
        beforeMutation: (operation) => {
          mutations.push(operation);
        },
      },
      {
        admitConfiguration: (candidate) => {
          if (reject) throw new Error('output root is leased');
          // The host receives a detached inspection value, never the commit configuration.
          (candidate as { outputRoot: string; themes: { light: string } }).outputRoot = '/changed';
          (candidate as { themes: { light: string } }).themes.light = 'changed';
        },
      },
    );
    const config = configuration(root);
    const initial = await commit(committer, request(snapshot(config)));
    if (initial.status !== 'committed') throw new Error('Expected initial commit');
    const output = path.join(config.outputRoot, 'content.txt');
    const manifest = path.join(config.outputRoot, '.ng-doc-output-manifest.json');
    const before = {
      output: fs.readFileSync(output),
      manifest: fs.readFileSync(manifest),
      outputMtime: fs.statSync(output).mtimeMs,
      manifestMtime: fs.statSync(manifest).mtimeMs,
      mutations: [...mutations],
    };

    reject = true;
    await expect(
      commit(committer, request(snapshot(config, 'refused', 'revision-two'), 2, initial.manifest)),
    ).resolves.toEqual({
      status: 'failed',
      diagnostics: [expect.objectContaining({ code: 'BOOTSTRAP_ADMISSION_FAILED' })],
    });
    expect(fs.readFileSync(output)).toEqual(before.output);
    expect(fs.readFileSync(manifest)).toEqual(before.manifest);
    expect(fs.statSync(output).mtimeMs).toBe(before.outputMtime);
    expect(fs.statSync(manifest).mtimeMs).toBe(before.manifestMtime);
    expect(mutations).toEqual(before.mutations);

    reject = false;
    await expect(
      commit(
        committer,
        request(snapshot(config, 'recovered', 'revision-three'), 3, initial.manifest),
      ),
    ).resolves.toMatchObject({ status: 'committed' });
    expect(fs.readFileSync(output, 'utf8')).toBe('recovered');
    await committer.dispose();
  });

  it('does not admit stale or aborted candidates', async () => {
    const admitConfiguration = vi.fn();
    const committer = createCandidateOutputCommitter({}, { admitConfiguration });
    const value = request(snapshot(configuration(root)));
    expect(
      await committer.commit(value, { isCurrent: () => false }, new AbortController().signal),
    ).toEqual({ status: 'stale', diagnostics: [] });
    const controller = new AbortController();
    controller.abort();
    expect(await committer.commit(value, { isCurrent: () => true }, controller.signal)).toEqual({
      status: 'stale',
      diagnostics: [],
    });
    expect(admitConfiguration).not.toHaveBeenCalled();
    await committer.dispose();
    expect(await commit(committer, value)).toMatchObject({
      status: 'failed',
      diagnostics: [expect.objectContaining({ code: 'BOOTSTRAP_DISPOSED' })],
    });
    expect(admitConfiguration).not.toHaveBeenCalled();
  });

  it('rejects restart-required roots before host admission', async () => {
    const admitConfiguration = vi.fn();
    const committer = createCandidateOutputCommitter({}, { admitConfiguration });
    const initialConfig = configuration(root);
    const initial = await commit(committer, request(snapshot(initialConfig)));
    if (initial.status !== 'committed') throw new Error('Expected initial commit');
    const changed = { ...initialConfig, outputRoot: path.join(root, 'other-output') };
    await expect(
      commit(committer, request(snapshot(changed), 2, initial.manifest)),
    ).resolves.toMatchObject({
      status: 'failed',
      diagnostics: [expect.objectContaining({ code: 'BOOTSTRAP_RESTART_REQUIRED' })],
    });
    expect(admitConfiguration).toHaveBeenCalledTimes(1);
    await committer.dispose();
  });

  it('does not mutate when admission changes currentness or disposes reentrantly', async () => {
    let current = true;
    const committer: ReturnType<typeof createCandidateOutputCommitter> =
      createCandidateOutputCommitter(
        {},
        {
          admitConfiguration: () => {
            current = false;
            void committer.dispose();
          },
        },
      );
    await expect(
      committer.commit(
        request(snapshot(configuration(root))),
        { isCurrent: () => current },
        new AbortController().signal,
      ),
    ).resolves.toEqual({ status: 'stale', diagnostics: [] });
    expect(fs.existsSync(path.join(root, 'output'))).toBe(false);
    await committer.dispose();
  });

  it('rejects a nested commit while admission is active and commits only the outer candidate', async () => {
    let nested!: Promise<Awaited<ReturnType<typeof commit>>>;
    let admissions = 0;
    const config = configuration(root);
    const committer: ReturnType<typeof createCandidateOutputCommitter> =
      createCandidateOutputCommitter(
        {},
        {
          admitConfiguration: () => {
            admissions++;
            nested = commit(committer, request(snapshot(config, 'nested', 'nested-revision'), 2));
          },
        },
      );
    const outer = commit(committer, request(snapshot(config, 'outer', 'outer-revision')));
    await expect(outer).resolves.toMatchObject({ status: 'committed' });
    await expect(nested).resolves.toEqual({
      status: 'failed',
      diagnostics: [expect.objectContaining({ code: 'BOOTSTRAP_COMMIT_IN_PROGRESS' })],
    });
    expect(admissions).toBe(1);
    expect(fs.readFileSync(path.join(config.outputRoot, 'content.txt'), 'utf8')).toBe('outer');
    await committer.dispose();
  });

  it('joins disposal before deferred admission without invoking the hook or mutating output', async () => {
    const admitConfiguration = vi.fn();
    const committer = createCandidateOutputCommitter({}, { admitConfiguration });
    const pending = commit(committer, request(snapshot(configuration(root))));
    const disposed = committer.dispose();
    await expect(pending).resolves.toEqual({
      status: 'failed',
      diagnostics: [expect.objectContaining({ code: 'BOOTSTRAP_DISPOSED' })],
    });
    await disposed;
    expect(admitConfiguration).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(root, 'output'))).toBe(false);
  });

  it('rejects and consumes asynchronous admission results', async () => {
    const rejection = new Error('late admission rejection');
    const admitConfiguration = vi.fn(() => Promise.reject(rejection)) as unknown as (
      configuration: Readonly<PublishedGeneratorConfiguration>,
    ) => void;
    const committer = createCandidateOutputCommitter({}, { admitConfiguration });
    await expect(commit(committer, request(snapshot(configuration(root))))).resolves.toEqual({
      status: 'failed',
      diagnostics: [
        expect.objectContaining({
          code: 'BOOTSTRAP_ADMISSION_FAILED',
          message: 'Configuration admission must complete synchronously.',
        }),
      ],
    });
    expect(fs.existsSync(path.join(root, 'output'))).toBe(false);
    await Promise.resolve();
    await committer.dispose();
  });

  it('contains concurrent calls and aborts an active delegate during disposal', async () => {
    let entered!: () => void;
    const started = new Promise<void>((resolve) => (entered = resolve));
    const never = new Promise<void>(() => undefined);
    const committer = createCandidateOutputCommitter({
      beforeMutation: (operation) => {
        if (operation === 'stage-write') {
          entered();
          return never;
        }
      },
    });
    const active = commit(committer, request(snapshot(configuration(root))));
    await started;
    expect(await commit(committer, request(snapshot(configuration(root))))).toEqual({
      status: 'failed',
      diagnostics: [expect.objectContaining({ code: 'BOOTSTRAP_COMMIT_IN_PROGRESS' })],
    });
    await committer.dispose();
    expect((await active).status).not.toBe('committed');
    expect(fs.existsSync(path.join(root, 'output', 'content.txt'))).toBe(false);
  });
});

function request(
  candidate: ReturnType<typeof snapshot>,
  generation: number = 1,
  previous?: CommitRequest['previous'],
): CommitRequest {
  return { generation, candidate, ...(previous ? { previous } : {}) };
}

function commit(
  committer: ReturnType<typeof createCandidateOutputCommitter>,
  value: CommitRequest,
) {
  return committer.commit(
    value,
    { isCurrent: (generation) => generation === value.generation },
    new AbortController().signal,
  );
}
