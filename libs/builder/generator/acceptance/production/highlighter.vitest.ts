import '@angular/compiler';

import { createEnvironmentInjector, runInInjectionContext } from '@angular/core';
// This acceptance suite exercises the app runtime's highlighter, which the builder never imports.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { NgDocHighlighterService } from '@ng-doc/app/services/highlighter/highlighter.service';
// The theme token the service under test injects (same exemption as above).
// eslint-disable-next-line @nx/enforce-module-boundaries
import { NG_DOC_SHIKI_THEME } from '@ng-doc/app/tokens';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('shiki/core', () => ({ createHighlighterCore: create }));
const custom = { themes: [{ name: 'custom', tokenColors: [] }] };
const highlighter = () => ({ codeToHtml: vi.fn(() => '<pre>colored</pre>'), dispose: vi.fn() });
function owner(theme: { light: string; dark: string } = { light: '', dark: '' }) {
  const injector = createEnvironmentInjector(
    [{ provide: NG_DOC_SHIKI_THEME, useValue: theme }],
    null!,
  );
  const service = runInInjectionContext(injector, () => new NgDocHighlighterService());
  return service;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  Reflect.deleteProperty(NgDocHighlighterService, 'defaultInitialization');
  create.mockReset();
});
describe('per-application custom Shiki ownership', () => {
  it('coalesces initialization and reuses the fixed default across independent applications', async () => {
    const pending = deferred<ReturnType<typeof highlighter>>();
    create.mockReturnValue(pending.promise);
    const first = owner(),
      second = owner();
    expect(first.highlight('before')).toBe('');
    const a = first.initialize();
    expect(first.initialize()).toBe(a);
    const b = second.initialize({ themes: [] });
    expect(create).toHaveBeenCalledTimes(1);
    const shared = highlighter();
    pending.resolve(shared);
    await Promise.all([a, b]);
    first.ngOnDestroy();
    first.ngOnDestroy();
    expect(shared.dispose).not.toHaveBeenCalled();
    expect(first.highlight('after')).toBe('');
    expect(second.highlight('<b>')).toBe('<pre>colored</pre>');
    expect(shared.codeToHtml).toHaveBeenLastCalledWith('<b>', {
      lang: 'angular-html',
      themes: { light: 'github-light', dark: 'ayu-dark' },
    });
    await second.initialize();
    expect(create).toHaveBeenCalledTimes(1);
    await expect(first.initialize()).rejects.toThrow('destroyed');
    second.ngOnDestroy();
  });
  it('isolates concurrent custom themes and disposes exactly the owned instance', async () => {
    const a = highlighter(),
      b = highlighter();
    create.mockResolvedValueOnce(a).mockResolvedValueOnce(b);
    const first = owner({ light: 'custom', dark: 'custom' }),
      second = owner();
    await Promise.all([first.initialize(custom), second.initialize(custom)]);
    expect(create).toHaveBeenCalledTimes(2);
    first.highlight('a');
    expect(a.codeToHtml).toHaveBeenCalledWith('a', {
      lang: 'angular-html',
      themes: { light: 'custom', dark: 'custom' },
    });
    first.ngOnDestroy();
    first.ngOnDestroy();
    expect(a.dispose).toHaveBeenCalledTimes(1);
    expect(b.dispose).not.toHaveBeenCalled();
    expect(second.highlight('b')).toBe('<pre>colored</pre>');
    second.ngOnDestroy();
    expect(b.dispose).toHaveBeenCalledTimes(1);
  });
  it('disposes a late custom result without publishing it after destruction', async () => {
    const pending = deferred<ReturnType<typeof highlighter>>();
    create.mockReturnValue(pending.promise);
    const service = owner(),
      result = highlighter();
    const init = service.initialize(custom);
    service.ngOnDestroy();
    pending.resolve(result);
    await init;
    expect(result.dispose).toHaveBeenCalledTimes(1);
    expect(service.highlight('late')).toBe('');
    service.ngOnDestroy();
    expect(result.dispose).toHaveBeenCalledTimes(1);
  });
  it('keeps a late shared default available after one application is destroyed', async () => {
    const pending = deferred<ReturnType<typeof highlighter>>();
    create.mockReturnValue(pending.promise);
    const first = owner(),
      result = highlighter();
    const init = first.initialize();
    first.ngOnDestroy();
    pending.resolve(result);
    await init;
    expect(first.highlight('late')).toBe('');
    const second = owner();
    await second.initialize();
    expect(second.highlight('live')).toBe('<pre>colored</pre>');
    expect(result.dispose).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
    second.ngOnDestroy();
  });
  it('retries rejected shared initialization for both existing and new applications', async () => {
    create.mockRejectedValueOnce(new Error('wasm unavailable')).mockResolvedValue(highlighter());
    const first = owner(),
      second = owner();
    await Promise.all([
      expect(first.initialize()).rejects.toThrow('wasm unavailable'),
      expect(second.initialize()).rejects.toThrow('wasm unavailable'),
    ]);
    expect(create).toHaveBeenCalledTimes(1);
    await Promise.all([first.initialize(), owner().initialize()]);
    expect(create).toHaveBeenCalledTimes(2);
    expect(first.highlight('retry')).toBe('<pre>colored</pre>');
  });
  it('retries failed custom initialization without contaminating defaults', async () => {
    create.mockRejectedValueOnce(new Error('custom unavailable')).mockResolvedValue(highlighter());
    const service = owner();
    await expect(service.initialize(custom)).rejects.toThrow('custom unavailable');
    await service.initialize(custom);
    const standard = owner();
    await standard.initialize();
    expect(create).toHaveBeenCalledTimes(3);
    expect(create.mock.calls[1][0].themes).toHaveLength(3);
    expect(create.mock.calls[2][0].themes).toHaveLength(2);
    service.ngOnDestroy();
    standard.ngOnDestroy();
  });
});
