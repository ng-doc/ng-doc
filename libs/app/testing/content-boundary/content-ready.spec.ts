import { ApplicationRef, Injector } from '@angular/core';
import { withNgDocContentReady } from '@ng-doc/app/helpers/content-ready';
import { NgDocContentState } from '@ng-doc/app/services/content-state';
import { type Mock, describe, expect, it, vi } from 'vitest';

interface Context {
  readonly request: string;
}

function application(
  state: NgDocContentState,
  stable: Promise<void> = Promise.resolve(),
): {
  application: ApplicationRef;
  destroy: Mock<() => void>;
  whenStable: Mock<() => Promise<void>>;
} {
  const destroy = vi.fn();
  const whenStable = vi.fn(() => stable);
  const injector = { get: () => state } as unknown as Injector;
  return {
    application: { destroy, injector, whenStable } as unknown as ApplicationRef,
    destroy,
    whenStable,
  };
}

describe('withNgDocContentReady', () => {
  it('forwards each context and keeps application error state isolated', async () => {
    const firstState = new NgDocContentState();
    const secondState = new NgDocContentState();
    const first = application(firstState);
    const second = application(secondState);
    const bootstrap = vi.fn(async ({ request }: Context) =>
      request === 'first' ? first.application : second.application,
    );
    const ready = withNgDocContentReady(bootstrap);

    await expect(ready({ request: 'first' })).resolves.toBe(first.application);
    await expect(ready({ request: 'second' })).resolves.toBe(second.application);
    expect(bootstrap.mock.calls).toEqual([[{ request: 'first' }], [{ request: 'second' }]]);
    expect(first.destroy).not.toHaveBeenCalled();
    expect(second.destroy).not.toHaveBeenCalled();
  });

  it('awaits stability, destroys the created app, and rethrows the request-owned error', async () => {
    const state = new NgDocContentState();
    const failure = new Error('content rejected');
    state.report({}, { contentId: 'request/body', error: failure });
    const fixture = application(state);
    const ready = withNgDocContentReady(async (_context: Context) => fixture.application);

    await expect(ready({ request: 'failed' })).rejects.toBe(failure);
    expect(fixture.whenStable).toHaveBeenCalledTimes(1);
    expect(fixture.destroy).toHaveBeenCalledTimes(1);
  });

  it('destroys after a stability failure but cannot destroy an app that did not bootstrap', async () => {
    const stabilityError = new Error('stability');
    const fixture = application(new NgDocContentState(), Promise.reject(stabilityError));
    await expect(
      withNgDocContentReady(async (_context: object) => fixture.application)({}),
    ).rejects.toBe(stabilityError);
    expect(fixture.destroy).toHaveBeenCalledTimes(1);

    const bootstrapError = new Error('bootstrap');
    await expect(
      withNgDocContentReady(async (_context: object) => Promise.reject(bootstrapError))({}),
    ).rejects.toBe(bootstrapError);
  });

  it('preserves the original failure when application destruction also throws', async () => {
    const state = new NgDocContentState();
    const failure = new Error('original content failure');
    state.report({}, { contentId: 'body', error: failure });
    const fixture = application(state);
    fixture.destroy.mockImplementation(() => {
      throw new Error('destroy failure');
    });

    await expect(
      withNgDocContentReady(async (_context: object, _requestId: number) => fixture.application)(
        {},
        42,
      ),
    ).rejects.toBe(failure);
  });
});
