import { afterEach, describe, expect, it } from 'vitest';

/**
 * Which commits the session offers a delta base. The base is the committed snapshot and manifest
 * one acknowledgement made its state; the full commit (no base) repairs external output edits and
 * is asked for outside a watch, for reconciling generations, when the compiler found a published
 * output missing, and for every full (not targeted) generation of a compiler that tells them apart.
 */
import type { CommitRequest, CompilationRequest, RebuildReason } from '../../contracts';
import { type GeneratorBuildSession, createBuildSession } from '../build-session';
import { WATCHER_RESCAN } from '../watch-signals';
import { compilation, Events, harness, until } from './support';

const sessions: GeneratorBuildSession[] = [];
afterEach(async () => {
  await Promise.allSettled(sessions.splice(0).map((session) => session.dispose()));
});

function setup(whyRebuilt: (request: CompilationRequest) => RebuildReason[] = () => []) {
  const h = harness();
  h.compile.mockImplementation(async (request: CompilationRequest) => ({
    ...compilation(`test-${request.generation}`),
    whyRebuilt: whyRebuilt(request),
  }));
  const session = createBuildSession(h.services, { batchDelayMs: 0 });
  sessions.push(session);
  const requests = () => h.commit.mock.calls.map(([request]) => request as CommitRequest);
  return { h, session, requests };
}

async function watched(session: GeneratorBuildSession) {
  const events = new Events();
  const handle = await session.watch(events, () => {});
  expect((await handle.initial).status).toBe('success');
  return { events, handle };
}

describe('commit base', () => {
  it('offers the committed snapshot and manifest of the last acknowledgement to a watch edit', async () => {
    const { session, requests } = setup();
    const { events } = await watched(session);
    // The initial watch generation has no changes: a reconciling generation, a full commit.
    expect(requests()[0].base).toBeUndefined();
    const committedSnapshot = requests()[0].candidate;
    events.emit({ kind: 'update', path: '/docs/a.md' });
    await until(() => requests().length === 2 && !session.inspect().building);
    const request = requests()[1];
    expect(request.base?.snapshot).toEqual(committedSnapshot);
    expect(request.base?.manifest).toEqual({
      schemaVersion: 1,
      projectId: 'test',
      generation: 1,
      revision: 'test-1',
      files: [],
    });
    // The same manifest object as `previous`: one pair, one acknowledgement.
    expect(request.base?.manifest).toBe(request.previous);
    events.emit({ kind: 'update', path: '/docs/b.md' });
    await until(() => requests().length === 3 && !session.inspect().building);
    expect(requests()[2].base?.manifest).toMatchObject({ generation: 2, revision: 'test-2' });
  });

  it('asks for the full commit when the compiler found a published output missing', async () => {
    const { session, requests } = setup((request) =>
      request.generation === 2
        ? [{ ownerId: 'page', reason: 'output-missing', detail: 'page.mjs' }]
        : [],
    );
    const { events } = await watched(session);
    events.emit({ kind: 'update', path: '/docs/a.md' });
    await until(() => requests().length === 2 && !session.inspect().building);
    expect(requests()[1].base).toBeUndefined();
    expect(requests()[1].previous).toMatchObject({ generation: 1 });
    events.emit({ kind: 'update', path: '/docs/b.md' });
    await until(() => requests().length === 3 && !session.inspect().building);
    expect(requests()[2].base).toBeDefined();
  });

  it('asks for the full commit for reconciling generations: a watcher rescan or rescan()', async () => {
    const { session, requests } = setup();
    const { events } = await watched(session);
    events.onError?.({
      code: WATCHER_RESCAN,
      message: 'rescan',
      severity: 'warning',
      stage: 'host',
    });
    await until(() => requests().length === 2 && !session.inspect().building);
    expect(requests()[1].base).toBeUndefined();
    await session.rescan();
    await until(() => requests().length === 3 && !session.inspect().building);
    expect(requests()[2].base).toBeUndefined();
    events.emit({ kind: 'update', path: '/docs/a.md' });
    await until(() => requests().length === 4 && !session.inspect().building);
    expect(requests()[3].base).toBeDefined();
  });

  it('asks for the full commit outside a watch', async () => {
    const { session, requests } = setup();
    expect((await session.buildOnce({ mode: 'development' })).status).toBe('success');
    expect((await session.buildOnce({ mode: 'development' })).status).toBe('success');
    expect((await session.buildOnce({ mode: 'production' })).status).toBe('success');
    expect(requests().map((request) => request.base)).toEqual([undefined, undefined, undefined]);
    expect(requests()[1].previous).toMatchObject({ generation: 1 });
  });

  it('keeps offering the last committed pair after a failed commit', async () => {
    const { h, session, requests } = setup();
    const { events } = await watched(session);
    h.commit.mockImplementationOnce(async () => ({
      status: 'failed',
      diagnostics: [{ code: 'X', message: 'x', severity: 'error', stage: 'commit' }],
    }));
    events.emit({ kind: 'update', path: '/docs/a.md' });
    await until(() => requests().length === 2 && !session.inspect().building);
    events.emit({ kind: 'update', path: '/docs/b.md' });
    await until(() => requests().length === 3 && !session.inspect().building);
    // The committer decides: the base is still generation 1, which it will not trust after a
    // non-committed call and commit in full.
    expect(requests()[2].base?.manifest).toMatchObject({ generation: 1, revision: 'test-1' });
  });

  it('asks for the full commit for every full generation of a compiler that tells them from targeted ones', async () => {
    const { h, session, requests } = setup();
    // Generation 3 is targeted; every other one is a full generation (and full generations
    // repair: their commit re-verifies every output).
    const targeted = new WeakSet<object>();
    h.compile.mockImplementation(async (request: CompilationRequest) => {
      const result = compilation(`test-${request.generation}`);
      if (request.generation === 3) targeted.add(result);
      return result;
    });
    h.services.compiler.targetedResult = (result) => targeted.has(result);
    const { events } = await watched(session);
    events.emit({ kind: 'update', path: '/docs/a.md' });
    await until(() => requests().length === 2 && !session.inspect().building);
    expect(requests()[1].base).toBeUndefined();
    events.emit({ kind: 'update', path: '/docs/b.md' });
    await until(() => requests().length === 3 && !session.inspect().building);
    // Asked of the object the compiler returned, not of the session's own copy.
    expect(requests()[2].base?.manifest).toMatchObject({ generation: 2, revision: 'test-2' });
  });
});
