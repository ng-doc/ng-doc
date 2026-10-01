import {
  ChangeDetectionStrategy,
  Component,
  EnvironmentProviders,
  inject,
  Provider,
  provideZoneChangeDetection,
  provideZonelessChangeDetection,
  signal,
  viewChild,
} from '@angular/core';
import { ComponentFixture, ComponentFixtureAutoDetect, TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouterOutlet } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { NgDocOverlayRef } from '@ng-doc/ui-kit/classes/overlay-ref';
import { DialogOutletComponent } from '@ng-doc/ui-kit/components/dialog-outlet';
import { NgDocDropdownComponent } from '@ng-doc/ui-kit/components/dropdown';
import { NgDocOverlayPointerComponent } from '@ng-doc/ui-kit/components/overlay-pointer';
import { NgDocDropdownHandlerDirective } from '@ng-doc/ui-kit/directives/dropdown-handler';
import { NgDocDropdownOriginDirective } from '@ng-doc/ui-kit/directives/dropdown-origin';
import { NgDocEventSwitcherDirective } from '@ng-doc/ui-kit/directives/event-switcher';
import { NgDocFocusCatcherDirective } from '@ng-doc/ui-kit/directives/focus-catcher';
import { NgDocTooltipDirective } from '@ng-doc/ui-kit/directives/tooltip';
import { NgDocOverlayConfig } from '@ng-doc/ui-kit/interfaces';
import {
  NG_DOC_DIALOG_DATA,
  NgDocDialogConfig,
  NgDocDialogService,
} from '@ng-doc/ui-kit/services/dialog';
import { NgDocComponentContent } from '@ng-doc/ui-kit/types';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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
 * Waits until the application is stable, timers of the given length have fired and the
 * animations (resolved promises here) have finished.
 * @param fixture - Any fixture of the test.
 * @param ms - How long to let timers run.
 */
async function settle(fixture: ComponentFixture<unknown>, ms: number = 0): Promise<void> {
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve, ms));
  await fixture.whenStable();
}

/**
 * A DOMRect for a mocked layout.
 * @param x - Left edge.
 * @param y - Top edge.
 * @param width - Width.
 * @param height - Height.
 */
function rect(x: number, y: number, width: number, height: number): DOMRect {
  return {
    x,
    y,
    width,
    height,
    top: y,
    left: x,
    right: x + width,
    bottom: y + height,
    toJSON: () => ({}),
  } as DOMRect;
}

/**
 * Dispatches a pointer click the way a browser does: pointerdown, then click.
 * @param target - The clicked element.
 */
function pointerClick(target: Element): void {
  target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

/**
 * Presses a key on an element.
 * @param target - The element that has focus.
 * @param key - The key, also used as the code.
 */
function press(target: Element, key: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, bubbles: true }));
}

/**
 * The overlay pane that has the given panel class.
 * @param panelClass - The class.
 */
function pane(panelClass: string): HTMLElement | null {
  return document.querySelector(`.cdk-overlay-pane.${panelClass}`);
}

/**
 * Makes the next overlay animation wait until the returned function is called.
 * @returns Finishes the animation.
 */
function holdNextAnimation(): () => void {
  let finish: () => void = () => void 0;
  const finished: Promise<void> = new Promise<void>((resolve) => (finish = resolve));

  animate.mockImplementationOnce(() => ({ finished }) as unknown as Animation);

  return finish;
}

/**
 * Spies on the console and returns the NG0953 messages (an output emitted after its owner was
 * destroyed).
 */
function watchDestroyedOutputs(): () => string[] {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => void 0);
  const error = vi.spyOn(console, 'error').mockImplementation(() => void 0);

  return () =>
    [...warn.mock.calls, ...error.mock.calls]
      .map((args: unknown[]) => args.map(String).join(' '))
      .filter((message: string) => message.includes('NG0953'));
}

// jsdom implements no Web Animations; the overlay container awaits `animate().finished`.
const animate = vi.fn(() => ({ finished: Promise.resolve() }) as unknown as Animation);

beforeAll(() => {
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
  // jsdom has no layout: give the viewport the size the CDK position strategy measures.
  Object.defineProperty(document.documentElement, 'clientWidth', {
    configurable: true,
    value: 1024,
  });
  Object.defineProperty(document.documentElement, 'clientHeight', {
    configurable: true,
    value: 768,
  });
});

afterAll(() => {
  delete (Element.prototype as Partial<Element>).animate;
  delete (document.documentElement as { clientWidth?: number }).clientWidth;
  delete (document.documentElement as { clientHeight?: number }).clientHeight;
});

@Component({
  template: `
    <div class="scroller">
      <button
        type="button"
        ngDocDropdownOrigin
        #origin="ngDocDropdownOrigin"
        [ngDocDropdownHandler]="dropdown">
        Origin {{ renders() }}
      </button>
    </div>
    <ng-doc-dropdown
      #dropdown
      [origin]="origin"
      [content]="content"
      [closeIfInnerClick]="closeIfInnerClick()"
      (beforeOpen)="events.push('beforeOpen')"
      (afterOpen)="events.push('afterOpen')"
      (beforeClose)="events.push('beforeClose')"
      (afterClose)="events.push('afterClose')" />
    <span class="outside">Outside</span>
  `,
  imports: [NgDocDropdownComponent, NgDocDropdownOriginDirective, NgDocDropdownHandlerDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class DropdownHostComponent {
  readonly dropdown = viewChild.required(NgDocDropdownComponent);
  readonly renders = signal(0);
  readonly closeIfInnerClick = signal(false);
  readonly content = 'Dropdown content';
  readonly events: string[] = [];
}

describeChangeDetection('NgDocDropdownComponent', ({ providers }) => {
  let fixture: ComponentFixture<DropdownHostComponent>;
  let host: DropdownHostComponent;
  let origin: HTMLButtonElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [...providers, provideRouter([])] });
    fixture = TestBed.createComponent(DropdownHostComponent);
    host = fixture.componentInstance;
    origin = fixture.nativeElement.querySelector('button');
    vi.spyOn(origin, 'getBoundingClientRect').mockReturnValue(rect(100, 100, 80, 20));
    // Give overlay panes a size, so that a position can overflow the viewport.
    const measure = Element.prototype.getBoundingClientRect;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      return this.classList.contains('cdk-overlay-pane')
        ? rect(0, 0, 200, 100)
        : measure.call(this);
    });
    await settle(fixture);
  });

  afterEach(() => vi.restoreAllMocks());

  it('opens with its content, emits the outputs and updates its host', async () => {
    host.dropdown().open();
    await settle(fixture);

    expect(pane('ng-doc-dropdown')?.textContent).toContain('Dropdown content');
    expect(host.dropdown().isOpened).toBe(true);
    expect(host.events).toEqual(['beforeOpen', 'afterOpen']);
    expect(fixture.nativeElement.querySelector('ng-doc-dropdown').getAttribute('tabindex')).toBe(
      '0',
    );
  });

  it('keeps subscribe() working on its outputs', async () => {
    const afterClose = vi.fn();
    const subscription = host.dropdown().afterClose.subscribe(afterClose);

    host.dropdown().open();
    await settle(fixture);
    host.dropdown().close();
    await settle(fixture);

    expect(afterClose).toHaveBeenCalledTimes(1);
    subscription.unsubscribe();
  });

  it('positions the overlay below the origin and points at it', async () => {
    host.dropdown().open();
    await settle(fixture);

    const container: HTMLElement | null = document.querySelector('ng-doc-overlay-container');
    const pointer: HTMLElement | null = document.querySelector('ng-doc-overlay-pointer');

    expect(container?.getAttribute('data-ng-doc-overlay-position')).toBe('bottom');
    expect(container?.getAttribute('data-ng-doc-overlay-with-contact-border')).toBe('true');
    expect(pointer?.getAttribute('data-ng-doc-overlay-position')).toBe('bottom');
    // A centered overlay has no alignment along the side it is on.
    expect(pointer?.hasAttribute('data-ng-doc-overlay-align')).toBe(false);
  });

  it('flips above the origin when there is no room below', async () => {
    vi.spyOn(origin, 'getBoundingClientRect').mockReturnValue(rect(100, 750, 80, 20));
    host.dropdown().open();
    await settle(fixture);

    expect(
      document
        .querySelector('ng-doc-overlay-container')
        ?.getAttribute('data-ng-doc-overlay-position'),
    ).toBe('top');
  });

  it('repositions the overlay when the origin moves after a render', async () => {
    host.dropdown().open();
    await settle(fixture, 20);

    const updatePosition = vi.spyOn(host.dropdown().overlay!.overlayRef, 'updatePosition');

    host.renders.update((value: number) => value + 1);
    await settle(fixture, 20);
    expect(updatePosition).not.toHaveBeenCalled();

    vi.spyOn(origin, 'getBoundingClientRect').mockReturnValue(rect(300, 100, 80, 20));
    host.renders.update((value: number) => value + 1);
    await settle(fixture, 20);

    expect(origin.textContent).toContain('Origin 2');
    expect(updatePosition).toHaveBeenCalled();
  });

  it('closes on an outside click, but not on a click on the origin', async () => {
    host.dropdown().open();
    await settle(fixture);

    pointerClick(origin);
    await settle(fixture);
    expect(host.dropdown().isOpened).toBe(true);

    pointerClick(fixture.nativeElement.querySelector('.outside'));
    await settle(fixture);

    expect(host.dropdown().isOpened).toBe(false);
    expect(pane('ng-doc-dropdown')).toBeNull();
    expect(host.events).toEqual(['beforeOpen', 'afterOpen', 'beforeClose', 'afterClose']);
    expect(fixture.nativeElement.querySelector('ng-doc-dropdown').getAttribute('tabindex')).toBe(
      '-1',
    );
  });

  it('closes on a click inside only with closeIfInnerClick', async () => {
    host.dropdown().open();
    await settle(fixture);
    pointerClick(pane('ng-doc-dropdown')!);
    await settle(fixture);
    expect(host.dropdown().isOpened).toBe(true);
    host.dropdown().close();
    await settle(fixture);

    host.closeIfInnerClick.set(true);
    await settle(fixture);
    host.dropdown().open();
    await settle(fixture);
    pointerClick(pane('ng-doc-dropdown')!);
    await settle(fixture);

    expect(host.dropdown().isOpened).toBe(false);
  });

  it('closes on Escape', async () => {
    host.dropdown().open();
    await settle(fixture);

    press(document.body, 'Escape');
    await settle(fixture);

    expect(host.dropdown().isOpened).toBe(false);
    expect(pane('ng-doc-dropdown')).toBeNull();
  });

  it('opens on ArrowDown and closes on Escape from the origin (ngDocDropdownHandler)', async () => {
    press(origin, 'ArrowDown');
    await settle(fixture);
    expect(host.dropdown().isOpened).toBe(true);

    press(origin, 'Escape');
    await settle(fixture);
    expect(host.dropdown().isOpened).toBe(false);
  });
});

@Component({
  template: `
    <button type="button" class="a" ngDocDropdownOrigin #a="ngDocDropdownOrigin">A</button>
    <button type="button" class="b" ngDocDropdownOrigin #b="ngDocDropdownOrigin">B</button>
    <ng-doc-dropdown
      [origin]="which() === 'a' ? a : which() === 'b' ? b : null"
      [content]="'Content'"
      (afterOpen)="events.push('afterOpen')"
      (afterClose)="events.push('afterClose')" />
  `,
  imports: [NgDocDropdownComponent, NgDocDropdownOriginDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class SwitchingOriginHostComponent {
  readonly dropdown = viewChild.required(NgDocDropdownComponent);
  readonly which = signal<'a' | 'b' | null>(null);
  readonly events: string[] = [];
}

describeChangeDetection('NgDocDropdownComponent origin and teardown', ({ providers }) => {
  let fixture: ComponentFixture<SwitchingOriginHostComponent>;
  let host: SwitchingOriginHostComponent;

  /** The element the open overlay is connected to. */
  function connectedOrigin(): unknown {
    return (host.dropdown().overlay?.overlayRef.getConfig() as NgDocOverlayConfig).origin;
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [...providers, provideRouter([])] });
    fixture = TestBed.createComponent(SwitchingOriginHostComponent);
    host = fixture.componentInstance;
    await settle(fixture);
  });

  afterEach(() => vi.restoreAllMocks());

  it('keeps an origin bound while closed after the binding returns to null', async () => {
    host.which.set('a');
    await settle(fixture);
    host.which.set(null);
    await settle(fixture);

    host.dropdown().open();
    await settle(fixture);

    expect(connectedOrigin()).toBe(fixture.nativeElement.querySelector('.a'));
  });

  it('uses the latest origin bound while closed, not the one it last opened on', async () => {
    host.which.set('a');
    await settle(fixture);
    host.dropdown().open();
    await settle(fixture);
    host.dropdown().close();
    await settle(fixture);

    host.which.set('b');
    await settle(fixture);
    host.which.set(null);
    await settle(fixture);
    host.dropdown().open();
    await settle(fixture);

    expect(connectedOrigin()).toBe(fixture.nativeElement.querySelector('.b'));
  });

  it('emits no output after it is destroyed during the open animation', async () => {
    const destroyedOutputs = watchDestroyedOutputs();
    const finishAnimation = holdNextAnimation();

    host.which.set('a');
    await settle(fixture);
    host.dropdown().open();
    await fixture.whenStable();

    fixture.destroy();
    finishAnimation();
    await new Promise((resolve) => setTimeout(resolve));

    expect(destroyedOutputs()).toEqual([]);
    // Destroying disposes the overlay, which reports the close while the outputs still exist; the
    // open animation that finishes afterwards reports nothing.
    expect(host.events).toEqual(['afterClose']);
  });
});

@Component({
  template: `
    <div class="scroller">
      <button
        type="button"
        [ngDocTooltip]="'Tooltip text'"
        [delay]="delay()"
        [canOpen]="canOpen()"
        (afterOpen)="events.push('afterOpen')"
        (afterClose)="events.push('afterClose')">
        Hover me
      </button>
    </div>
  `,
  imports: [NgDocTooltipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class TooltipHostComponent {
  readonly tooltip = viewChild.required(NgDocTooltipDirective);
  readonly canOpen = signal(true);
  readonly delay = signal(0);
  readonly events: string[] = [];
}

describeChangeDetection('NgDocTooltipDirective', ({ providers }) => {
  let fixture: ComponentFixture<TooltipHostComponent>;
  let host: TooltipHostComponent;
  let button: HTMLButtonElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [...providers, provideRouter([])] });
    fixture = TestBed.createComponent(TooltipHostComponent);
    host = fixture.componentInstance;
    button = fixture.nativeElement.querySelector('button');
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(rect(100, 300, 80, 20));
    await settle(fixture);
  });

  it('opens after hovering for the delay and closes when the pointer leaves', async () => {
    button.dispatchEvent(new MouseEvent('mouseenter'));
    await settle(fixture, 10);

    expect(pane('ng-doc-tooltip')?.textContent).toContain('Tooltip text');
    expect(host.tooltip().isOpened).toBe(true);
    expect(host.events).toEqual(['afterOpen']);
    expect(
      document
        .querySelector('ng-doc-overlay-container')
        ?.getAttribute('data-ng-doc-overlay-position'),
    ).toBe('top');

    button.dispatchEvent(new MouseEvent('mouseleave'));
    await settle(fixture, 80);

    expect(host.tooltip().isOpened).toBe(false);
    expect(pane('ng-doc-tooltip')).toBeNull();
    expect(host.events).toEqual(['afterOpen', 'afterClose']);
  });

  it('waits for the whole delay before it opens', async () => {
    host.delay.set(100);
    await settle(fixture);

    button.dispatchEvent(new MouseEvent('mouseenter'));
    await settle(fixture, 40);
    expect(host.tooltip().isOpened).toBe(false);
    expect(pane('ng-doc-tooltip')).toBeNull();

    await settle(fixture, 100);
    expect(host.tooltip().isOpened).toBe(true);
    expect(pane('ng-doc-tooltip')?.textContent).toContain('Tooltip text');
  });

  it('emits no output after it is destroyed during the open animation', async () => {
    const destroyedOutputs = watchDestroyedOutputs();
    const finishAnimation = holdNextAnimation();

    host.tooltip().show();
    await fixture.whenStable();

    fixture.destroy();
    finishAnimation();
    await new Promise((resolve) => setTimeout(resolve));

    expect(destroyedOutputs()).toEqual([]);
    // Destroying disposes the overlay, which reports the close while the outputs still exist; the
    // open animation that finishes afterwards reports nothing.
    expect(host.events).toEqual(['afterClose']);
    vi.restoreAllMocks();
  });

  it('disposes a closing tooltip and emits nothing when destroyed during the close animation', async () => {
    const destroyedOutputs = watchDestroyedOutputs();

    host.tooltip().show();
    await settle(fixture);
    const finishAnimation = holdNextAnimation();
    host.tooltip().hide();
    await fixture.whenStable();

    fixture.destroy();
    expect(pane('ng-doc-tooltip')).toBeNull();
    finishAnimation();
    await new Promise((resolve) => setTimeout(resolve));

    expect(destroyedOutputs()).toEqual([]);
    // The close is reported once, by the disposal, not again when the animation finishes.
    expect(host.events).toEqual(['afterOpen', 'afterClose']);
    vi.restoreAllMocks();
  });

  it('stays open when the pointer moves from the host onto the tooltip', async () => {
    button.dispatchEvent(new MouseEvent('mouseenter'));
    await settle(fixture, 10);

    button.dispatchEvent(new MouseEvent('mouseleave'));
    pane('ng-doc-tooltip')!.dispatchEvent(new MouseEvent('mouseenter'));
    await settle(fixture, 80);

    expect(host.tooltip().isOpened).toBe(true);
  });

  it('does not open while canOpen is false', async () => {
    host.canOpen.set(false);
    await settle(fixture);

    button.dispatchEvent(new MouseEvent('mouseenter'));
    await settle(fixture, 10);

    expect(host.tooltip().isOpened).toBe(false);
    expect(pane('ng-doc-tooltip')).toBeNull();
  });

  it('opens with show() and closes on Escape', async () => {
    host.tooltip().show();
    await settle(fixture);
    expect(pane('ng-doc-tooltip')).not.toBeNull();

    press(document.body, 'Escape');
    await settle(fixture);

    expect(host.tooltip().isOpened).toBe(false);
    expect(pane('ng-doc-tooltip')).toBeNull();
  });

  it('closes when a container of the host scrolls (NgDocOverlayStrategy)', async () => {
    host.tooltip().show();
    await settle(fixture);

    fixture.nativeElement.querySelector('.scroller').dispatchEvent(new Event('scroll'));
    await settle(fixture);

    expect(host.tooltip().isOpened).toBe(false);
    expect(pane('ng-doc-tooltip')).toBeNull();
  });
});

@Component({
  template: `<p class="dialog-content">Dialog: {{ data }}</p>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class DialogContentComponent {
  readonly data = inject(NG_DOC_DIALOG_DATA);
  readonly dialogRef = inject<NgDocOverlayRef<string>>(NgDocOverlayRef);
}

@Component({
  template: ``,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class EmptyHostComponent {}

describeChangeDetection('NgDocDialogService', ({ providers }) => {
  let fixture: ComponentFixture<EmptyHostComponent>;
  let dialog: NgDocDialogService;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [...providers, provideRouter([])] });
    fixture = TestBed.createComponent(EmptyHostComponent);
    dialog = TestBed.inject(NgDocDialogService);
    await settle(fixture);
  });

  it('renders a component with its data and returns the close result', async () => {
    const dialogRef = dialog.open<string>(new NgDocComponentContent(DialogContentComponent), {
      data: 'hello',
    });
    const afterClose = vi.fn();

    dialogRef.afterClose().subscribe(afterClose);
    await settle(fixture);

    expect(pane('ng-doc-dialog')?.querySelector('.dialog-content')?.textContent).toBe(
      'Dialog: hello',
    );

    dialogRef.close('result');
    await settle(fixture);

    expect(afterClose).toHaveBeenCalledWith('result');
    expect(pane('ng-doc-dialog')).toBeNull();
  });

  it('closes on Escape and on a backdrop click, unless disableClose is set', async () => {
    const escaped = dialog.open('Escape me');
    await settle(fixture);
    press(document.body, 'Escape');
    await settle(fixture);
    expect(escaped.isOpened).toBe(false);

    const clicked = dialog.open('Click outside', { hasBackdrop: true });
    await settle(fixture);
    pointerClick(document.querySelector('.cdk-overlay-backdrop')!);
    await settle(fixture);
    expect(clicked.isOpened).toBe(false);

    // The dialog config is passed on to the overlay, so overlay options such as disableClose apply.
    const lockedConfig: NgDocDialogConfig & { disableClose: boolean } = { disableClose: true };
    const locked = dialog.open('Locked', lockedConfig);
    await settle(fixture);
    press(document.body, 'Escape');
    await settle(fixture);
    expect(locked.isOpened).toBe(true);
    expect(pane('ng-doc-dialog')?.textContent).toContain('Locked');
  });
});

@Component({
  template: `
    <ng-doc-dialog-outlet>
      <router-outlet />
    </ng-doc-dialog-outlet>
  `,
  imports: [DialogOutletComponent, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class DialogRouteHostComponent {}

@Component({
  template: `<p class="routed-dialog">Routed dialog</p>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class RoutedDialogComponent {}

describeChangeDetection('DialogOutletComponent', ({ providers }) => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ...providers,
        provideRouter([
          {
            path: '',
            component: DialogRouteHostComponent,
            children: [{ path: 'details', component: RoutedDialogComponent }],
          },
        ]),
      ],
    });
  });

  it('shows the active child route in a dialog and navigates back when it closes', async () => {
    const harness = await RouterTestingHarness.create('/');
    expect(pane('ng-doc-dialog')).toBeNull();

    await harness.navigateByUrl('/details');
    await settle(harness.fixture);
    expect(pane('ng-doc-dialog')?.textContent).toContain('Routed dialog');

    press(document.body, 'Escape');
    await settle(harness.fixture);

    expect(TestBed.inject(Router).url).toBe('/');
    expect(pane('ng-doc-dialog')).toBeNull();
  });
});

@Component({
  template: `
    <div
      ngDocFocusCatcher
      #catcher="ngDocFocusCatcher"
      (focusEvent)="events.push('focus')"
      (blurEvent)="events.push('blur')">
      <input />
    </div>
  `,
  imports: [NgDocFocusCatcherDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class FocusCatcherHostComponent {
  readonly catcher = viewChild.required(NgDocFocusCatcherDirective);
  readonly events: string[] = [];
}

describeChangeDetection('NgDocFocusCatcherDirective', ({ providers }) => {
  it('tracks focus inside its host', async () => {
    TestBed.configureTestingModule({ providers });
    const fixture = TestBed.createComponent(FocusCatcherHostComponent);
    const catcher: HTMLElement = fixture.nativeElement.querySelector('div');
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    await settle(fixture);
    expect(catcher.getAttribute('data-ng-doc-focused')).toBe('false');

    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await settle(fixture);

    expect(fixture.componentInstance.catcher().focused).toBe(true);
    expect(catcher.getAttribute('data-ng-doc-focused')).toBe('true');

    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await settle(fixture);

    expect(fixture.componentInstance.catcher().focused).toBe(false);
    expect(catcher.getAttribute('data-ng-doc-focused')).toBe('false');
    expect(fixture.componentInstance.events).toEqual(['focus', 'blur']);
  });
});

@Component({
  template: `
    <div class="source" [ngDocEventSwitcher]="target" [events]="['keydown']"><span></span></div>
    <div class="target" #target></div>
  `,
  imports: [NgDocEventSwitcherDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class EventSwitcherHostComponent {}

describeChangeDetection('NgDocEventSwitcherDirective', ({ providers }) => {
  it('re-dispatches the events of its host on the target', async () => {
    TestBed.configureTestingModule({ providers });
    const fixture = TestBed.createComponent(EventSwitcherHostComponent);
    await settle(fixture);
    const onTarget = vi.fn();
    const onParent = vi.fn();

    fixture.nativeElement.querySelector('.target').addEventListener('keydown', onTarget);
    fixture.nativeElement.addEventListener('keydown', (event: Event) =>
      onParent((event.target as HTMLElement).className),
    );
    press(fixture.nativeElement.querySelector('span'), 'Enter');

    expect(onTarget).toHaveBeenCalledWith(expect.objectContaining({ key: 'Enter' }));
    // The original event stops at the source; only the copy bubbles up from the target.
    expect(onParent.mock.calls).toEqual([['target']]);
  });
});

@Component({
  template: `<ng-doc-overlay-pointer
    [overlayPosition]="'left'"
    [overlayAlign]="'top'"
    [withPointer]="withPointer()" />`,
  imports: [NgDocOverlayPointerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class PointerHostComponent {
  readonly withPointer = signal(true);
}

describeChangeDetection('NgDocOverlayPointerComponent', ({ providers }) => {
  it('reflects its inputs on the host and draws the arrow on demand', async () => {
    TestBed.configureTestingModule({ providers });
    const fixture = TestBed.createComponent(PointerHostComponent);
    await settle(fixture);
    const pointer: HTMLElement = fixture.nativeElement.querySelector('ng-doc-overlay-pointer');

    expect(pointer.getAttribute('data-ng-doc-overlay-position')).toBe('left');
    expect(pointer.getAttribute('data-ng-doc-overlay-align')).toBe('top');
    expect(pointer.querySelector('.ng-doc-pointer')).not.toBeNull();

    fixture.componentInstance.withPointer.set(false);
    await settle(fixture);

    expect(pointer.querySelector('.ng-doc-pointer')).toBeNull();
  });
});
