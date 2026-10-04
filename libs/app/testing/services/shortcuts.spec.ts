import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  NG_DOC_SHORTCUTS,
  NG_DOC_STORE_SHORTCUTS_KEY,
  NgDocShortcutsService,
} from '@ng-doc/app/services/shortcuts';
import { NgDocThemeService } from '@ng-doc/app/services/theme';
import { WA_LOCAL_STORAGE } from '@ng-web-apis/common';
import { type Mock, beforeEach, expect, it, vi } from 'vitest';

import { describeChangeDetection } from '../change-detection/change-detection-modes';

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

@Component({
  selector: 'ng-doc-shortcut-hint-fixture',
  template: `
    @if (shortcuts.enabled()) {
      <kbd>/</kbd>
    }
    <input type="text" />
    <textarea></textarea>
    <div contenteditable="true"></div>
    @for (role of roles; track role) {
      <div tabindex="0" [attr.role]="role" [attr.data-role]="role"><span>item</span></div>
    }
    <ng-doc-demo><button type="button" class="in-demo">Demo button</button></ng-doc-demo>
    <ng-doc-playground
      ><button type="button" class="in-playground">Button</button></ng-doc-playground
    >
  `,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ShortcutHintFixtureComponent {
  protected readonly shortcuts = inject(NgDocShortcutsService);
  protected readonly roles = [
    'combobox',
    'listbox',
    'menu',
    'menubar',
    'grid',
    'tree',
    'treegrid',
    'slider',
    'spinbutton',
    'application',
  ];
}

/** Dispatches a keydown event on the target. */
function press(target: EventTarget, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });

  target.dispatchEvent(event);

  return event;
}

describeChangeDetection('NgDocShortcutsService', ({ providers }) => {
  let storage: MemoryStorage;
  let theme: ReturnType<typeof signal<string | null>>;
  let themeService: { theme: typeof theme; set: Mock };

  /** Configures TestBed and returns the service. */
  function setup(extra: unknown[] = []) {
    TestBed.configureTestingModule({
      providers: [
        providers,
        { provide: WA_LOCAL_STORAGE, useValue: storage },
        { provide: NgDocThemeService, useValue: themeService },
        ...(extra as never[]),
      ],
    });

    return TestBed.inject(NgDocShortcutsService);
  }

  /** Renders the hint fixture and waits for its first render. */
  async function render() {
    const fixture = TestBed.createComponent(ShortcutHintFixtureComponent);

    await fixture.whenStable();

    return fixture;
  }

  beforeEach(() => {
    storage = new MemoryStorage();
    theme = signal<string | null>(null);
    themeService = { theme, set: vi.fn((id?: string) => theme.set(id ?? null)) };
  });

  it('runs a registered single-key shortcut and prevents the default action', () => {
    const service = setup();
    const handler = vi.fn();

    service.register({ key: '/', handler });
    const event = press(document.body, '/');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('compares keys without regard to case and accepts Shift', () => {
    const service = setup();
    const handler = vi.fn();

    service.register({ key: 'f', handler });
    press(document.body, 'F', { shiftKey: true });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('ignores single keys while the reader types in a field', async () => {
    const service = setup();
    const handler = vi.fn();
    const fixture = await render();

    service.register({ key: 'f', handler });

    for (const selector of ['input', 'textarea', '[contenteditable]']) {
      const event = press(fixture.nativeElement.querySelector(selector), 'f');

      expect(event.defaultPrevented).toBe(false);
    }
    expect(handler).not.toHaveBeenCalled();
  });

  it('ignores single keys inside widgets with their own keys, demos and playgrounds', async () => {
    const service = setup();
    const handler = vi.fn();
    const fixture = await render();
    const element: HTMLElement = fixture.nativeElement;

    service.register({ key: 'f', handler });

    for (const target of [
      ...Array.from(element.querySelectorAll('[data-role] span')),
      element.querySelector('.in-demo')!,
      element.querySelector('.in-playground')!,
    ]) {
      expect(press(target, 'f').defaultPrevented).toBe(false);
    }
    expect(handler).not.toHaveBeenCalled();

    press(document.body, 'f');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('ignores repeated keys', () => {
    const service = setup();
    const handler = vi.fn();

    service.register({ key: 't', handler });
    press(document.body, 't', { repeat: true });

    expect(handler).not.toHaveBeenCalled();
  });

  it('accepts square brackets typed with AltGr', () => {
    const service = setup();
    const handler = vi.fn();

    service.register({ key: '[', handler });
    const event = new KeyboardEvent('keydown', {
      key: '[',
      ctrlKey: true,
      altKey: true,
      bubbles: true,
      cancelable: true,
    });

    Object.defineProperty(event, 'getModifierState', {
      value: (modifier: string) => modifier === 'AltGraph',
    });
    document.body.dispatchEvent(event);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('ignores single keys with Command, Control or Alt held', () => {
    const service = setup();
    const handler = vi.fn();

    service.register({ key: 'l', handler });
    press(document.body, 'l', { metaKey: true });
    press(document.body, 'l', { ctrlKey: true });
    press(document.body, 'l', { altKey: true });

    expect(handler).not.toHaveBeenCalled();
  });

  it('ignores keys another listener already handled', () => {
    const service = setup();
    const handler = vi.fn();
    const event = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true });

    service.register({ key: '/', handler });
    event.preventDefault();
    document.body.dispatchEvent(event);

    expect(handler).not.toHaveBeenCalled();
  });

  it('runs chords while typing and while single-key shortcuts are off', async () => {
    const service = setup();
    const handler = vi.fn();
    const fixture = await render();

    service.register({ key: 'k', chord: true, handler });
    service.setEnabled(false);
    press(fixture.nativeElement.querySelector('input'), 'k', { metaKey: true });
    press(document.body, 'k', { ctrlKey: true });
    press(document.body, 'k');

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('turns single-key shortcuts off, hides their hints and saves the choice', async () => {
    const service = setup();
    const handler = vi.fn();
    const fixture = await render();

    service.register({ key: '/', handler });
    expect(fixture.nativeElement.querySelector('kbd')).not.toBeNull();

    service.toggle();
    await fixture.whenStable();
    press(document.body, '/');

    expect(service.enabled()).toBe(false);
    expect(handler).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('kbd')).toBeNull();
    expect(storage.getItem(NG_DOC_STORE_SHORTCUTS_KEY)).toBe('0');

    service.toggle();
    press(document.body, '/');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(storage.getItem(NG_DOC_STORE_SHORTCUTS_KEY)).toBe('1');
  });

  it('starts from the site default and applies the saved choice after the first render', async () => {
    storage.setItem(NG_DOC_STORE_SHORTCUTS_KEY, '1');
    const service = setup([{ provide: NG_DOC_SHORTCUTS, useValue: false }]);

    expect(service.enabled()).toBe(false);

    await render();

    expect(service.enabled()).toBe(true);
  });

  it('keeps the site default when no choice is saved', async () => {
    const service = setup([{ provide: NG_DOC_SHORTCUTS, useValue: false }]);
    const handler = vi.fn();

    service.register({ key: '/', handler });
    await render();
    press(document.body, '/');

    expect(service.enabled()).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it('runs the shortcut registered last and restores the previous one when it is removed', () => {
    const service = setup();
    const first = vi.fn();
    const second = vi.fn();

    service.register({ key: 'f', handler: first });
    const remove = service.register({ key: 'f', handler: second });

    press(document.body, 'f');
    remove();
    press(document.body, 'f');

    expect(second).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1);
  });

  it('runs a single-key shortcut on request, also while they are off', () => {
    const service = setup();
    const handler = vi.fn();

    service.register({ key: 'f', handler });
    service.setEnabled(false);

    expect(service.run('F')).toBe(true);
    expect(handler).toHaveBeenCalledWith();
    expect(service.run('q')).toBe(false);
  });

  it('switches between the light and the dark theme with T', () => {
    setup();

    press(document.body, 't');
    expect(themeService.set).toHaveBeenLastCalledWith('dark');

    press(document.body, 'T');
    expect(themeService.set).toHaveBeenLastCalledWith(undefined);
  });

  it('restores the auto or custom theme with a second T', () => {
    setup();

    for (const previous of ['auto', 'ocean']) {
      theme.set(previous);

      press(document.body, 't');
      expect(themeService.set).toHaveBeenLastCalledWith('dark');

      press(document.body, 't');
      expect(themeService.set).toHaveBeenLastCalledWith(previous);
    }
  });

  it('does not restore an old theme after the reader changed it', () => {
    setup();
    theme.set('auto');

    press(document.body, 't');
    theme.set(null);
    press(document.body, 't');

    expect(themeService.set).toHaveBeenLastCalledWith('dark');
  });

  it('opens the previous and the next page with the square brackets', () => {
    setup();
    const document = TestBed.inject(DOCUMENT);
    const prev = document.createElement('a');
    const next = document.createElement('a');
    const clicks: string[] = [];

    prev.rel = 'prev';
    next.className = 'ng-doc-next-page';
    prev.addEventListener('click', (event) => (event.preventDefault(), clicks.push('prev')));
    next.addEventListener('click', (event) => (event.preventDefault(), clicks.push('next')));
    document.body.append(prev, next);

    try {
      press(document.body, '[');
      press(document.body, ']');
    } finally {
      prev.remove();
      next.remove();
    }

    expect(clicks).toEqual(['prev', 'next']);
  });

  it('copies the link to the page with L', () => {
    setup();
    const writeText = vi.fn(() => Promise.resolve());

    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    try {
      press(document.body, 'l');
    } finally {
      delete (navigator as { clipboard?: unknown }).clipboard;
    }

    expect(writeText).toHaveBeenCalledWith(document.location.href);
  });

  it('stops listening when the application is destroyed', () => {
    const service = setup();
    const handler = vi.fn();

    service.register({ key: '/', handler });
    TestBed.resetTestingModule();
    press(document.body, '/');

    expect(handler).not.toHaveBeenCalled();
  });

  it('never touches the document or the storage on the server', () => {
    const addEventListener = vi.spyOn(document, 'addEventListener');
    const getItem = vi.spyOn(storage, 'getItem');

    try {
      const service = setup([{ provide: PLATFORM_ID, useValue: 'server' }]);

      service.setEnabled(false);

      expect(addEventListener).not.toHaveBeenCalledWith('keydown', expect.any(Function));
      expect(getItem).not.toHaveBeenCalled();
      expect(storage.values.size).toBe(0);
      expect(service.enabled()).toBe(false);
    } finally {
      addEventListener.mockRestore();
    }
  });
});
