import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EnvironmentProviders,
  inject,
  NgZone,
  PendingTasks,
  Provider,
  provideZoneChangeDetection,
  provideZonelessChangeDetection,
  signal,
  Type,
  viewChild,
} from '@angular/core';
import { ComponentFixture, ComponentFixtureAutoDetect, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NgDocListHost } from '@ng-doc/ui-kit/classes/list-host';
import { NgDocDataListComponent } from '@ng-doc/ui-kit/components/data-list';
import { NgDocDataListGroupComponent } from '@ng-doc/ui-kit/components/data-list-group';
import {
  NgDocSelectionComponent,
  NgDocSelectionHostDirective,
  NgDocSelectionOriginDirective,
} from '@ng-doc/ui-kit/components/selection';
import { NgDocTextComponent, NgDocTextLeftDirective } from '@ng-doc/ui-kit/components/text';
import { NgDocFocusableDirective } from '@ng-doc/ui-kit/directives/focusable';
import { NgDocRadioGroupDirective } from '@ng-doc/ui-kit/directives/radio-group';
import { NgDocRotatorDirective } from '@ng-doc/ui-kit/directives/rotator';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// The site's API reference documents every exported declaration under libs/ui-kit, tests
// included, so this spec exports nothing and declares its change-detection helper locally (the
// same helper as testing/change-detection/change-detection-modes.spec.ts).

/** How TestBed schedules change detection in a spec. */
type ChangeDetectionMode = 'zone' | 'zoneless';

/** One change-detection mode and the providers that select it. */
interface ChangeDetectionCase {
  mode: ChangeDetectionMode;
  providers: Array<Provider | EnvironmentProviders>;
}

/**
 * The change-detection modes a spec can run in here: both with zone.js loaded (`nx test`), only
 * zoneless without it (`nx run ui-kit:test-zoneless`).
 */
function changeDetectionCases(): ChangeDetectionCase[] {
  const zoneLoaded = typeof (globalThis as { Zone?: unknown }).Zone !== 'undefined';
  const cases: ChangeDetectionCase[] = [
    { mode: 'zoneless', providers: [provideZonelessChangeDetection()] },
  ];

  return zoneLoaded
    ? [
        {
          mode: 'zone',
          providers: [
            provideZoneChangeDetection(),
            { provide: ComponentFixtureAutoDetect, useValue: true },
          ],
        },
        ...cases,
      ]
    : cases;
}

/**
 * Declares a `describe` block per change-detection mode.
 * @param title - Title of the block; the mode is appended.
 * @param body - Declares the specs for one mode.
 */
function describeChangeDetection(
  title: string,
  body: (testCase: ChangeDetectionCase) => void,
): void {
  for (const testCase of changeDetectionCases()) {
    describe(`${title} (${testCase.mode})`, () => body(testCase));
  }
}

/**
 * Waits until the application is stable, after the microtasks in which forms write values.
 * @param fixture - The fixture of the test.
 */
async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
}

// The CDK key manager reads the legacy `keyCode`, which jsdom does not derive from `key`.
const KEY_CODES: Record<string, number> = { Enter: 13, ArrowUp: 38, ArrowDown: 40 };

/**
 * Presses a key on an element.
 * @param target - The element that has focus.
 * @param key - The key, also used as the code.
 */
function press(target: Element, key: string): void {
  const event: KeyboardEvent = new KeyboardEvent('keydown', { key, code: key, bubbles: true });

  Object.defineProperty(event, 'keyCode', { value: KEY_CODES[key] ?? 0 });
  target.dispatchEvent(event);
}

/**
 * Gives an element the layout that `ng-doc-selection` measures (jsdom has none).
 * @param element - The element.
 * @param left - `offsetLeft`.
 * @param width - `offsetWidth`.
 */
function layout(element: HTMLElement, left: number, width: number): void {
  Object.defineProperties(element, {
    offsetLeft: { configurable: true, value: left },
    offsetTop: { configurable: true, value: 0 },
    offsetWidth: { configurable: true, value: width },
    offsetHeight: { configurable: true, value: 30 },
  });
}

// jsdom implements no scrolling; the list scrolls the active option into view.
beforeAll(() => {
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
});

afterAll(() => {
  delete (Element.prototype as Partial<Element>).scrollIntoView;
});

@Component({
  selector: 'ng-doc-list-host-fixture',
  imports: [NgDocDataListComponent, NgDocRadioGroupDirective, FormsModule],
  providers: [{ provide: NgDocListHost, useExisting: ListHostComponent }],
  template: `
    <input class="origin" />
    <div ngDocRadioGroup [(ngModel)]="value">
      <ng-doc-data-list
        [items]="items()"
        [itemDisabledFn]="isDisabled"
        [emptyContent]="'Nothing found'" />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ListHostComponent implements NgDocListHost {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly items = signal<string[]>(['Alpha', 'Beta', 'Gamma']);
  readonly value = signal<string | null>(null);
  readonly isDisabled = (item: string): boolean => item === 'Gamma';

  get listHostOrigin(): HTMLElement | undefined {
    // The origin input is created before the list, which reads this in its constructor.
    return this.elementRef.nativeElement.querySelector<HTMLElement>('input.origin') ?? undefined;
  }
}

interface Fruit {
  name: string;
  color: string;
}

@Component({
  imports: [NgDocDataListGroupComponent],
  template: `
    <ng-doc-data-list-group
      [items]="items()"
      [itemGroupFn]="colorOf"
      [itemContent]="nameOf"
      [groupContent]="groupTitle" />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class GroupHostComponent {
  readonly items = signal<Fruit[]>([
    { name: 'Apple', color: 'red' },
    { name: 'Banana', color: 'yellow' },
    { name: 'Cherry', color: 'red' },
  ]);
  readonly colorOf = (fruit: Fruit): string => fruit.color;
  readonly nameOf = ({ $implicit }: { $implicit: Fruit }): string => $implicit.name;
  readonly groupTitle = ({ $implicit }: { $implicit: string }): string => $implicit.toUpperCase();
}

@Component({
  imports: [NgDocSelectionHostDirective, NgDocSelectionOriginDirective, NgDocSelectionComponent],
  template: `
    <div ngDocSelectionHost>
      @for (tab of tabs(); track tab) {
        <a class="tab" [ngDocSelectionOrigin]="tab === active()">{{ tab }}</a>
      }
      <ng-doc-selection />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class SelectionHostComponent {
  readonly tabs = signal<string[]>(['One', 'Two']);
  readonly active = signal<string | null>('One');
}

@Component({
  imports: [NgDocSelectionHostDirective, NgDocSelectionOriginDirective, NgDocSelectionComponent],
  template: `
    @for (group of [0, 1]; track group) {
      <div ngDocSelectionHost>
        @for (tab of ['One', 'Two']; track tab) {
          <a class="tab" [ngDocSelectionOrigin]="tab === active()">{{ tab }}</a>
        }
        <ng-doc-selection />
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class TwoSelectionsHostComponent {
  readonly active = signal<string | null>(null);
}

// Static markup, as in a generated page: the tabs carry no ngDocSelectionOrigin.
@Component({
  imports: [NgDocSelectionHostDirective, NgDocSelectionComponent],
  template: `
    <div ngDocSelectionHost>
      <ng-doc-selection [align]="null" />
      <a class="tab">One</a>
      <a class="tab">Two</a>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class StaticSelectionHostComponent {
  readonly selectionHost = viewChild.required(NgDocSelectionHostDirective);
}

@Component({
  imports: [
    NgDocTextComponent,
    NgDocTextLeftDirective,
    NgDocFocusableDirective,
    NgDocRotatorDirective,
  ],
  template: `
    <span ng-doc-text size="small" color="muted">
      @if (withIcon()) {
        <b ngDocTextLeft>*</b>
      }
      Label
    </span>
    <button type="button" [ngDocFocusable]="focusable()" [ngDocRotator]="rotated()" [to]="180">
      Rotate
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class TextHostComponent {
  readonly withIcon = signal(false);
  readonly focusable = signal(true);
  readonly rotated = signal(false);
}

describeChangeDetection('ui-kit list primitives', ({ providers }: ChangeDetectionCase) => {
  /**
   * Renders a host component and waits until it is stable.
   * @param component - The host component.
   */
  async function render<T>(component: Type<T>): Promise<ComponentFixture<T>> {
    TestBed.configureTestingModule({ providers });

    const fixture: ComponentFixture<T> = TestBed.createComponent(component);

    await settle(fixture);

    return fixture;
  }

  /**
   * The elements that match a selector in the fixture.
   * @param fixture - The fixture.
   * @param selector - The CSS selector.
   */
  function queryAll(fixture: ComponentFixture<unknown>, selector: string): HTMLElement[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll(selector));
  }

  afterEach(() => TestBed.resetTestingModule());

  describe('ng-doc-data-list', () => {
    it('renders an option per item and the empty content without items', async () => {
      const fixture = await render(ListHostComponent);
      const options: HTMLElement[] = queryAll(fixture, 'ng-doc-option');

      expect(options.map((option: HTMLElement) => option.textContent?.trim())).toEqual([
        'Alpha',
        'Beta',
        'Gamma',
      ]);
      expect(options[2].getAttribute('aria-disabled')).toBe('true');

      fixture.componentInstance.items.set([]);
      await settle(fixture);

      expect(queryAll(fixture, 'ng-doc-option')).toHaveLength(0);
      expect(queryAll(fixture, '.ng-doc-empty-message')[0].textContent?.trim()).toBe(
        'Nothing found',
      );
    });

    it('checks the clicked option in the host control', async () => {
      const fixture = await render(ListHostComponent);

      queryAll(fixture, 'ng-doc-option')[1].click();
      await settle(fixture);

      expect(fixture.componentInstance.value()).toBe('Beta');
      expect(queryAll(fixture, 'ng-doc-option')[1].getAttribute('aria-checked')).toBe('true');
    });

    it('navigates with the keys pressed on the list host origin', async () => {
      const fixture = await render(ListHostComponent);
      const origin: HTMLElement = queryAll(fixture, 'input.origin')[0];

      press(origin, 'ArrowDown');
      await settle(fixture);

      const options: HTMLElement[] = queryAll(fixture, 'ng-doc-option');

      expect(options[0].getAttribute('data-ng-doc-hover')).toBe('true');

      press(origin, 'ArrowDown');
      await settle(fixture);

      expect(options[0].getAttribute('data-ng-doc-hover')).toBe('false');
      expect(options[1].getAttribute('data-ng-doc-hover')).toBe('true');

      press(origin, 'Enter');
      await settle(fixture);

      expect(fixture.componentInstance.value()).toBe('Beta');
    });

    it('handles origin keys while the application has pending work', async () => {
      TestBed.configureTestingModule({ providers });

      const fixture: ComponentFixture<ListHostComponent> =
        TestBed.createComponent(ListHostComponent);
      // A polling timer (tracked by zone.js in a zone app) and a pending task (for example a
      // request) keep the application unstable for the whole test.
      const interval = TestBed.inject(NgZone).run(() => setInterval(() => void 0, 10));
      const removeTask: () => void = TestBed.inject(PendingTasks).add();
      const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

      try {
        fixture.detectChanges();
        await wait(20);

        const origin: HTMLElement = queryAll(fixture, 'input.origin')[0];

        press(origin, 'ArrowDown');
        await wait(20);
        fixture.detectChanges();

        expect(queryAll(fixture, 'ng-doc-option')[0].getAttribute('data-ng-doc-hover')).toBe(
          'true',
        );
      } finally {
        clearInterval(interval);
        removeTask();
        fixture.destroy();
      }
    });
  });

  describe('ng-doc-data-list-group', () => {
    it('groups the options under a header per group', async () => {
      const fixture = await render(GroupHostComponent);
      const groups: HTMLElement[] = queryAll(fixture, 'ng-doc-option-group');

      expect(groups).toHaveLength(2);
      expect(groups[0].querySelector('.ng-doc-option-group-header')?.textContent?.trim()).toBe(
        'RED',
      );
      expect(
        Array.from(groups[0].querySelectorAll('ng-doc-option')).map((option: Element) =>
          option.textContent?.trim(),
        ),
      ).toEqual(['Apple', 'Cherry']);

      fixture.componentInstance.items.update((items: Fruit[]) => [
        ...items,
        { name: 'Lime', color: 'green' },
      ]);
      await settle(fixture);

      expect(queryAll(fixture, 'ng-doc-option-group')).toHaveLength(3);
    });
  });

  describe('ng-doc-selection', () => {
    it('follows the selected origin and hides without one', async () => {
      TestBed.configureTestingModule({ providers });

      const fixture: ComponentFixture<SelectionHostComponent> =
        TestBed.createComponent(SelectionHostComponent);
      const host: HTMLElement = fixture.nativeElement;

      fixture.detectChanges();

      const [one, two] = Array.from(host.querySelectorAll<HTMLElement>('a.tab'));
      const selection: HTMLElement = host.querySelector('ng-doc-selection')!;

      layout(one, 0, 40);
      layout(two, 40, 60);
      fixture.componentInstance.active.set('Two');
      await settle(fixture);

      expect(selection.getAttribute('aria-hidden')).toBe('true');
      expect(selection.getAttribute('data-ng-doc-align')).toBe('bottom');
      expect(selection.style.transform).toBe('translate(40px, 0px)');
      expect(selection.style.width).toBe('60px');
      expect(selection.style.height).toBe('30px');
      expect(selection.style.visibility).toBe('visible');

      fixture.componentInstance.active.set(null);
      await settle(fixture);

      expect(selection.style.visibility).toBe('hidden');

      fixture.componentInstance.active.set('One');
      await settle(fixture);

      expect(selection.style.transform).toBe('translate(0px, 0px)');
      expect(selection.style.visibility).toBe('visible');

      fixture.componentInstance.tabs.set(['Two']);
      await settle(fixture);

      expect(selection.style.visibility).toBe('hidden');
    });

    it('does not animate its first placement, and animates the moves after it', async () => {
      TestBed.configureTestingModule({ providers });

      const fixture: ComponentFixture<SelectionHostComponent> =
        TestBed.createComponent(SelectionHostComponent);
      const host: HTMLElement = fixture.nativeElement;

      fixture.detectChanges();

      const [one, two] = Array.from(host.querySelectorAll<HTMLElement>('a.tab'));
      const selection: HTMLElement = host.querySelector('ng-doc-selection')!;
      const getComputedStyle = vi.spyOn(window, 'getComputedStyle');
      const frames = (): Promise<void> =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );

      try {
        // Nothing was measured yet: the selected element keeps its own style.
        expect(selection.hasAttribute('data-ng-doc-placed')).toBe(false);

        layout(one, 0, 40);
        layout(two, 40, 60);
        fixture.componentInstance.active.set('Two');
        await settle(fixture);

        // The first position is painted before the transition turns on.
        expect(selection.style.transform).toBe('translate(40px, 0px)');
        expect(selection.hasAttribute('data-ng-doc-placed')).toBe(true);
        expect(selection.hasAttribute('data-ng-doc-animated')).toBe(false);

        await frames();

        expect(selection.hasAttribute('data-ng-doc-animated')).toBe(true);

        // A move keeps the transition on.
        fixture.componentInstance.active.set('One');
        await settle(fixture);

        expect(selection.style.transform).toBe('translate(0px, 0px)');
        expect(selection.hasAttribute('data-ng-doc-animated')).toBe(true);

        // Without a selected element the highlight hides and is placed again without animation.
        fixture.componentInstance.active.set(null);
        await settle(fixture);

        expect(selection.hasAttribute('data-ng-doc-placed')).toBe(false);
        expect(selection.hasAttribute('data-ng-doc-animated')).toBe(false);

        fixture.componentInstance.active.set('Two');
        await settle(fixture);

        expect(selection.hasAttribute('data-ng-doc-animated')).toBe(false);

        await frames();

        expect(selection.hasAttribute('data-ng-doc-animated')).toBe(true);
        // Placing never reads the computed style, which would force a layout.
        expect(getComputedStyle).not.toHaveBeenCalledWith(selection);
      } finally {
        getComputedStyle.mockRestore();
      }
    });

    it('measures every highlight before it moves any of them', async () => {
      TestBed.configureTestingModule({ providers });

      const fixture: ComponentFixture<TwoSelectionsHostComponent> = TestBed.createComponent(
        TwoSelectionsHostComponent,
      );
      const host: HTMLElement = fixture.nativeElement;
      const events: string[] = [];

      fixture.detectChanges();

      host.querySelectorAll<HTMLElement>('a.tab').forEach((tab: HTMLElement, index: number) => {
        Object.defineProperty(tab, 'offsetWidth', {
          configurable: true,
          get: () => {
            events.push(`read ${index}`);

            return 10;
          },
        });
      });
      host.querySelectorAll<HTMLElement>('ng-doc-selection').forEach((selection, index) => {
        const width = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, 'width')!;

        Object.defineProperty(selection.style, 'width', {
          configurable: true,
          get: () => width.get!.call(selection.style),
          set: (value: string) => {
            events.push(`write ${index}`);
            width.set!.call(selection.style, value);
          },
        });
      });

      fixture.componentInstance.active.set('Two');
      await settle(fixture);

      // Each element is read more than once; what matters is that no write comes between reads.
      expect(events.filter((event, index) => event !== events[index - 1])).toEqual([
        'read 1',
        'read 3',
        'write 0',
        'write 1',
      ]);
    });

    it('follows an element selected on the host directly', async () => {
      TestBed.configureTestingModule({ providers });

      const fixture: ComponentFixture<StaticSelectionHostComponent> = TestBed.createComponent(
        StaticSelectionHostComponent,
      );
      const host: HTMLElement = fixture.nativeElement;

      fixture.detectChanges();

      const [one, two] = Array.from(host.querySelectorAll<HTMLElement>('a.tab'));
      const selection: HTMLElement = host.querySelector('ng-doc-selection')!;
      const selectionHost: NgDocSelectionHostDirective = fixture.componentInstance.selectionHost();

      layout(one, 0, 40);
      layout(two, 40, 60);
      selectionHost.select(two);
      await settle(fixture);

      expect(selectionHost.selected()).toBe(two);
      expect(selection.hasAttribute('data-ng-doc-align')).toBe(false);
      expect(selection.style.transform).toBe('translate(40px, 0px)');
      expect(selection.style.width).toBe('60px');
      expect(selection.hasAttribute('data-ng-doc-placed')).toBe(true);

      selectionHost.select(one);
      await settle(fixture);

      expect(selection.style.transform).toBe('translate(0px, 0px)');
      expect(selection.style.width).toBe('40px');

      selectionHost.select(undefined);
      await settle(fixture);

      expect(selectionHost.selected()).toBeUndefined();
      expect(selection.style.visibility).toBe('hidden');
      expect(selection.hasAttribute('data-ng-doc-placed')).toBe(false);
    });

    it('waits for the selected element to get a box before placing itself', async () => {
      TestBed.configureTestingModule({ providers });

      const fixture: ComponentFixture<SelectionHostComponent> =
        TestBed.createComponent(SelectionHostComponent);
      const host: HTMLElement = fixture.nativeElement;
      const selection: HTMLElement = host.querySelector('ng-doc-selection')!;

      // jsdom lays nothing out, as a hidden container would not.
      fixture.detectChanges();
      await settle(fixture);

      expect(selection.style.visibility).toBe('hidden');
      expect(selection.hasAttribute('data-ng-doc-placed')).toBe(false);
    });
  });

  describe('ng-doc-text, ngDocFocusable and ngDocRotator', () => {
    it('reflects inputs on the host and shows side content when it appears', async () => {
      const fixture = await render(TextHostComponent);
      const text: HTMLElement = queryAll(fixture, '[ng-doc-text]')[0];
      const button: HTMLElement = queryAll(fixture, 'button')[0];

      expect(text.classList).toContain('ngde');
      expect(text.getAttribute('data-ng-doc-text-size')).toBe('small');
      expect(text.getAttribute('data-ng-doc-text-color')).toBe('muted');
      expect(text.querySelector('.ng-doc-text-left')).toBeNull();
      expect(button.getAttribute('tabindex')).toBe('0');
      expect(button.style.transform).toBe('rotateZ(0deg)');

      fixture.componentInstance.withIcon.set(true);
      fixture.componentInstance.focusable.set(false);
      fixture.componentInstance.rotated.set(true);
      await settle(fixture);

      expect(text.querySelector('.ng-doc-text-left')?.textContent).toBe('*');
      expect(button.getAttribute('tabindex')).toBe('-1');
      expect(button.style.transform).toBe('rotateZ(180deg)');
    });
  });
});
