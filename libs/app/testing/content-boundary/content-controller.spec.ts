import {
  createEnvironmentInjector,
  EnvironmentInjector,
  PendingTasks,
  runInInjectionContext,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NgDocContentController, validatePayload } from '@ng-doc/app/classes/content-controller';
import { ɵpeekNgDocContent, ɵpreloadNgDocContent } from '@ng-doc/app/helpers';
import { NgDocContentState } from '@ng-doc/app/services/content-state';
import { NgDocContentModule, NgDocContentSource } from '@ng-doc/core/interfaces';
import { type Mock, describe, expect, it, vi } from 'vitest';

class PendingTasksHarness {
  active = 0;
  readonly releases: Array<Mock<() => void>> = [];

  add(): () => void {
    this.active++;
    const release = vi.fn(() => {
      this.active--;
    });
    this.releases.push(release);
    return release;
  }
}

// Destroys the injector that owns the controller, as destroying its component would.
class DestroyHarness {
  private destroyed = false;

  constructor(private readonly injector: EnvironmentInjector) {}

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.injector.destroy();
  }
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function payload(id: string, html: string, revision: string = html): NgDocContentModule {
  return { schemaVersion: 1, id, revision, html };
}

function controller(state: NgDocContentState = new NgDocContentState()): {
  controller: NgDocContentController;
  tasks: PendingTasksHarness;
  destroy: DestroyHarness;
  state: NgDocContentState;
} {
  const tasks = new PendingTasksHarness();
  const injector = createEnvironmentInjector(
    [
      { provide: PendingTasks, useValue: tasks },
      { provide: NgDocContentState, useValue: state },
    ],
    TestBed.inject(EnvironmentInjector),
  );
  return {
    controller: runInInjectionContext(injector, () => new NgDocContentController()),
    tasks,
    destroy: new DestroyHarness(injector),
    state,
  };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('NgDocContentController', () => {
  it('keeps the pending task through accepted processor completion', async () => {
    const fixture = controller();
    const source: NgDocContentSource = {
      id: 'body',
      load: async () => payload('body', '<p>ready</p>'),
    };

    fixture.controller.connect(source);
    expect(fixture.tasks.active).toBe(1);
    await flush();
    expect(fixture.controller.html()).toBe('<p>ready</p>');
    expect(fixture.tasks.active).toBe(1);

    fixture.controller.processed(fixture.controller.version());
    expect(fixture.tasks.active).toBe(0);
    expect(fixture.state.currentFailure()).toBeUndefined();
  });

  it('aborts a superseded request and suppresses its stale completion', async () => {
    const first = deferred<NgDocContentModule>();
    const second = deferred<NgDocContentModule>();
    const signals: AbortSignal[] = [];
    let invalidate!: () => void;
    let call = 0;
    const source: NgDocContentSource = {
      id: 'body',
      load: (signal) => {
        signals.push(signal);
        return call++ === 0 ? first.promise : second.promise;
      },
      subscribe: (callback) => {
        invalidate = callback;
        return vi.fn();
      },
    };
    const fixture = controller();
    fixture.controller.connect(source);
    invalidate();

    expect(signals[0]?.aborted).toBe(true);
    expect(fixture.tasks.active).toBe(1);
    first.resolve(payload('body', '<p>stale</p>'));
    await flush();
    expect(fixture.controller.html()).toBe('');
    expect(fixture.tasks.active).toBe(1);

    second.resolve(payload('body', '<p>current</p>'));
    await flush();
    fixture.controller.processed(fixture.controller.version());
    expect(fixture.controller.html()).toBe('<p>current</p>');
    expect(fixture.tasks.active).toBe(0);
  });

  it('settles same-html revisions without requiring an Angular input change', async () => {
    let revision = 'one';
    let invalidate!: () => void;
    const source: NgDocContentSource = {
      id: 'body',
      load: async () => payload('body', '<p>same</p>', revision),
      subscribe: (callback) => {
        invalidate = callback;
        return vi.fn();
      },
    };
    const fixture = controller();
    fixture.controller.connect(source);
    await flush();
    fixture.controller.processed(fixture.controller.version());

    revision = 'two';
    invalidate();
    await flush();
    expect(fixture.tasks.active).toBe(0);
    expect(fixture.controller.version()).toBe(1);
  });

  it('keeps an initially empty payload pending until its empty processor pass completes', async () => {
    const fixture = controller();
    fixture.controller.connect({ id: 'empty', load: async () => payload('empty', '') });
    await flush();
    expect(fixture.tasks.active).toBe(1);
    fixture.controller.processed(0);
    expect(fixture.tasks.active).toBe(0);
  });

  it('does not let an old processor event settle a newer load before same HTML is accepted', async () => {
    const first = deferred<NgDocContentModule>();
    const second = deferred<NgDocContentModule>();
    let invalidate!: () => void;
    let calls = 0;
    const fixture = controller();
    fixture.controller.connect({
      id: 'body',
      load: () => (calls++ === 0 ? first.promise : second.promise),
      subscribe: (callback) => {
        invalidate = callback;
        return vi.fn();
      },
    });
    first.resolve(payload('body', '<p>same</p>', 'one'));
    await flush();
    const version = fixture.controller.version();
    invalidate();

    fixture.controller.processed(version);
    expect(fixture.tasks.active).toBe(1);
    second.resolve(payload('body', '<p>same</p>', 'two'));
    await flush();
    // The accepted bytes are identical, so the already completed DOM pass is current.
    expect(fixture.tasks.active).toBe(0);
  });

  it('forces a new processor pass when the same HTML follows a failed old pass', async () => {
    const first = deferred<NgDocContentModule>();
    const second = deferred<NgDocContentModule>();
    let invalidate!: () => void;
    let calls = 0;
    const fixture = controller();
    fixture.controller.connect({
      id: 'body',
      load: () => (calls++ === 0 ? first.promise : second.promise),
      subscribe: (callback) => {
        invalidate = callback;
        return vi.fn();
      },
    });
    first.resolve(payload('body', '<p>same</p>', 'one'));
    await flush();
    const failedVersion = fixture.controller.version();
    invalidate();
    fixture.controller.processingFailed({
      version: failedVersion,
      error: new Error('obsolete processor failure'),
    });
    second.resolve(payload('body', '<p>same</p>', 'two'));
    await flush();

    expect(fixture.controller.version()).toBe(failedVersion + 1);
    expect(fixture.tasks.active).toBe(1);
    fixture.controller.processed(fixture.controller.version());
    expect(fixture.tasks.active).toBe(0);
    expect(fixture.controller.error()).toBeUndefined();
  });

  it('clears another source identity and ignores invalidations from its stale subscriber', async () => {
    let staleInvalidate!: () => void;
    const oldLoad = vi.fn(async () => payload('old', '<p>old</p>'));
    const next = deferred<NgDocContentModule>();
    const nextLoad = vi.fn(() => next.promise);
    const fixture = controller();
    fixture.controller.connect({
      id: 'old',
      load: oldLoad,
      subscribe: (invalidate) => {
        staleInvalidate = invalidate;
        return vi.fn();
      },
    });
    await flush();
    fixture.controller.processed(fixture.controller.version());
    expect(fixture.controller.html()).toContain('old');

    fixture.controller.connect({ id: 'new', load: nextLoad });
    expect(fixture.controller.html()).toBe('');
    staleInvalidate();
    expect(nextLoad).toHaveBeenCalledTimes(1);
    next.resolve(payload('new', '<p>new</p>'));
    await flush();
    expect(fixture.controller.html()).toContain('new');
  });

  it('records rejection and processor errors, then clears only its own recovered state', async () => {
    const state = new NgDocContentState();
    const a = controller(state);
    const b = controller(state);
    const loadError = new Error('body unavailable');
    a.controller.connect({ id: 'a', load: async () => Promise.reject(loadError) });
    b.controller.connect({ id: 'b', load: async () => payload('b', '<p>b</p>') });
    await flush();

    expect(a.tasks.active).toBe(0);
    expect(a.controller.error()).toBe(loadError);
    expect(state.currentFailure()).toEqual({ contentId: 'a', error: loadError });

    b.controller.processingFailed({ version: b.controller.version(), error: new Error('process') });
    expect(state.currentFailure()?.contentId).toBe('a');
    b.destroy.destroy();
    expect(state.currentFailure()).toEqual({ contentId: 'a', error: loadError });
  });

  it('unsubscribes, aborts and settles exactly once on destroy', () => {
    const unsubscribe = vi.fn();
    let signal!: AbortSignal;
    const fixture = controller();
    fixture.controller.connect({
      id: 'body',
      load: (currentSignal) => {
        signal = currentSignal;
        return new Promise<NgDocContentModule>(() => undefined);
      },
      subscribe: () => unsubscribe,
    });
    fixture.destroy.destroy();
    fixture.destroy.destroy();

    expect(signal.aborted).toBe(true);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(fixture.tasks.active).toBe(0);
    expect(fixture.tasks.releases[0]).toHaveBeenCalledTimes(1);
  });

  it('disconnects a modern source before returning to the legacy branch', async () => {
    const unsubscribe = vi.fn();
    const fixture = controller();
    fixture.controller.connect({
      id: 'header',
      load: async () => payload('header', '<p>modern</p>'),
      subscribe: () => unsubscribe,
    });
    await flush();
    fixture.controller.processed(fixture.controller.version());
    fixture.controller.disconnect();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(fixture.controller.html()).toBe('');
    expect(fixture.tasks.active).toBe(0);
    expect(fixture.state.currentFailure()).toBeUndefined();
  });

  it('contains throwing unsubscribe and rejects stale callbacks after reconnecting one source object', () => {
    const callbacks: Array<() => void> = [];
    const load = vi.fn(() => new Promise<NgDocContentModule>(() => undefined));
    const source: NgDocContentSource = {
      id: 'body',
      load,
      subscribe: (callback) => {
        callbacks.push(callback);
        return () => {
          throw new Error('unsubscribe failure');
        };
      },
    };
    const fixture = controller();
    fixture.controller.connect(source);
    fixture.controller.disconnect();
    fixture.controller.connect(source);
    callbacks[0]?.();
    expect(load).toHaveBeenCalledTimes(2);

    expect(() => fixture.destroy.destroy()).not.toThrow();
    expect(fixture.tasks.active).toBe(0);
  });

  it('rejects invalid schema, identity, and primitive fields', () => {
    expect(() => validatePayload(payload('other', ''), 'expected')).toThrow('expected');
    expect(() =>
      validatePayload({ schemaVersion: 2, id: 'a', revision: '', html: '' }, 'a'),
    ).toThrow('Invalid NgDoc content payload');
    expect(() =>
      validatePayload({ schemaVersion: 1, id: 'a', revision: 1, html: '' }, 'a'),
    ).toThrow('Invalid NgDoc content payload');
  });

  it('turns a synchronous subscription failure into request-owned state', () => {
    const failure = new Error('subscribe failed');
    const fixture = controller();
    fixture.controller.connect({
      id: 'body',
      load: async () => payload('body', ''),
      subscribe: () => {
        throw failure;
      },
    });

    expect(fixture.controller.error()).toBe(failure);
    expect(fixture.state.currentFailure()).toEqual({ contentId: 'body', error: failure });
    expect(fixture.tasks.active).toBe(0);
  });

  it('reports the loaded version and settles once it is processed, or on failure', async () => {
    const fixture = controller();
    const load = deferred<NgDocContentModule>();
    const source: NgDocContentSource = { id: 'body', load: () => load.promise };

    fixture.controller.connect(source);
    // The empty content is processed before the source has loaded: nothing is settled yet.
    fixture.controller.processed(0);
    expect(fixture.controller.loadedVersion()).toBeUndefined();
    expect(fixture.controller.settled()).toBe(false);

    load.resolve(payload('body', '<p>ready</p>'));
    await flush();
    expect(fixture.controller.loadedVersion()).toBe(1);
    expect(fixture.controller.settled()).toBe(false);

    fixture.controller.processed(1);
    expect(fixture.controller.settled()).toBe(true);

    const empty = controller();
    empty.controller.connect({ id: 'empty', load: async () => payload('empty', '') });
    empty.controller.processed(0);
    await flush();
    // An empty body is already on the page: its load settles without another pass.
    expect(empty.controller.loadedVersion()).toBe(0);
    expect(empty.controller.settled()).toBe(true);

    const failing = controller();
    failing.controller.connect({ id: 'failing', load: () => Promise.reject(new Error('gone')) });
    await flush();
    expect(failing.controller.settled()).toBe(true);
    expect(failing.controller.loadedVersion()).toBeUndefined();
  });

  it('applies a preloaded payload at once, without loading the source again', async () => {
    const load = vi.fn(async () => payload('body', '<p>preloaded</p>'));
    const source: NgDocContentSource = { id: 'body', load };

    await ɵpreloadNgDocContent(source);
    const fixture = controller();

    fixture.controller.connect(source);
    // Synchronously: the component's first render already has the content.
    expect(fixture.controller.html()).toBe('<p>preloaded</p>');
    expect(fixture.controller.loadedVersion()).toBe(fixture.controller.version());
    expect(fixture.tasks.active).toBe(1);
    expect(load).toHaveBeenCalledTimes(1);

    fixture.controller.processed(fixture.controller.version());
    expect(fixture.tasks.active).toBe(0);
    expect(fixture.controller.settled()).toBe(true);
  });

  it('loads a preload once for concurrent requests and retries a failed one', async () => {
    let fail = true;
    const load = vi.fn(async () => {
      if (fail) throw new Error('offline');
      return payload('body', '<p>later</p>');
    });
    const source: NgDocContentSource = { id: 'body', load };

    await expect(
      Promise.all([ɵpreloadNgDocContent(source), ɵpreloadNgDocContent(source)]),
    ).rejects.toThrow('offline');
    expect(load).toHaveBeenCalledTimes(1);
    expect(ɵpeekNgDocContent(source)).toBeUndefined();

    fail = false;
    await expect(ɵpreloadNgDocContent(source)).resolves.toMatchObject({ html: '<p>later</p>' });
    expect(load).toHaveBeenCalledTimes(2);
    expect(ɵpeekNgDocContent(source)?.html).toBe('<p>later</p>');
  });

  it('loads a new revision, not the preloaded payload, when the source reports a change', async () => {
    let html = '<p>first</p>';
    let invalidate!: () => void;
    const load = vi.fn(async () => payload('body', html));
    const source: NgDocContentSource = {
      id: 'body',
      load,
      subscribe: (callback) => {
        invalidate = callback;
        return vi.fn();
      },
    };

    await ɵpreloadNgDocContent(source);
    const fixture = controller();

    fixture.controller.connect(source);
    expect(fixture.controller.html()).toBe('<p>first</p>');

    html = '<p>second</p>';
    invalidate();
    await flush();
    expect(load).toHaveBeenCalledTimes(2);
    expect(fixture.controller.html()).toBe('<p>second</p>');
    expect(ɵpeekNgDocContent(source)).toBeUndefined();
  });
});
