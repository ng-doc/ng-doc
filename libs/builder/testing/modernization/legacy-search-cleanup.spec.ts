import { Subject } from 'rxjs';
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { pageComponentBuilder } from '../../engine/builders/shared/page-component.builder';
import { IndexStore } from '../../engine/core';
import { UTILS } from '../../helpers';
import type { NgDocBuilderContext } from '../../interfaces';

vi.mock('../../helpers', () => ({ UTILS: { replaceKeywords: vi.fn() } }));
vi.mock('../../helpers/build-indexes', () => ({
  buildIndexes: async ({ content }: { content: string }) => [{ content }],
}));
vi.mock('../../engine/nunjucks', () => ({ renderTemplate: () => 'generated component' }));
vi.mock('../../engine/core', () => ({
  IndexStore: { add: vi.fn() },
  keywordsStore: { get: vi.fn() },
}));

function harness() {
  const source = new Subject<never>();
  let prepare!: (html: string) => () => Promise<unknown>;
  const result = pageComponentBuilder(
    (postProcess) => {
      prepare = postProcess;
      return source;
    },
    {
      context: {
        config: {},
        context: { workspaceRoot: '/fixture', target: { project: 'fixture' } },
      } as NgDocBuilderContext,
      metadata: {
        path: '/fixture/index.md',
        outPath: '/fixture/generated/page.ts',
        title: 'Fixture',
        breadcrumbs: () => [],
        absoluteRoute: () => '/fixture',
      } as never,
      pageType: 'guide',
    },
  );
  const subscription = result.subscribe();
  return { prepare, dispose: () => subscription.unsubscribe() };
}

describe('search cleanup regression (isolated callback, not integration)', () => {
  let cleanup: Mock;
  let owner: ReturnType<typeof harness>;

  beforeEach(() => {
    vi.clearAllMocks();
    cleanup = vi.fn();
    (IndexStore.add as Mock).mockReturnValue(cleanup);
    (UTILS.replaceKeywords as Mock).mockImplementation(async (html: string) => html);
    owner = harness();
  });
  afterEach(() => owner.dispose());

  it('invokes the acquired cleanup exactly once on subscription disposal', async () => {
    await owner.prepare('<h1>Fixture</h1>')();
    expect(IndexStore.add).toHaveBeenCalledTimes(1);
    owner.dispose();
    owner.dispose();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('does not restore search records when an async renderer completes after disposal', async () => {
    let finish!: (html: string) => void;
    (UTILS.replaceKeywords as Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = owner.prepare('old')();
    owner.dispose();
    finish('old');
    await pending;
    expect(IndexStore.add).not.toHaveBeenCalled();
  });

  it('does not replace fresh records with a stale async render', async () => {
    let finish!: (html: string) => void;
    (UTILS.replaceKeywords as Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const old = owner.prepare('old')();
    await owner.prepare('new')();
    finish('old');
    await old;
    expect(IndexStore.add).toHaveBeenCalledTimes(1);
    expect(IndexStore.add).toHaveBeenCalledWith({ content: 'new' });
    owner.dispose();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
