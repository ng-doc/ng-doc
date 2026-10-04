import {
  ChangeDetectionStrategy,
  Component,
  EnvironmentProviders,
  Provider,
  provideZoneChangeDetection,
  provideZonelessChangeDetection,
} from '@angular/core';
import { ComponentFixtureAutoDetect, TestBed } from '@angular/core/testing';
import { NgDocHotkeyDirective } from '@ng-doc/ui-kit/directives/hotkey';
import { beforeEach, describe, expect, it } from 'vitest';

// The site's API reference documents every exported declaration under libs/ui-kit, tests
// included, so the change-detection helper is declared here instead of in an exported module
// (libs/app keeps an exported copy: its API scope excludes testing/**). A ui-kit spec that needs it
// copies these declarations until the ui-kit scope excludes tests.

/** How TestBed schedules change detection in a spec. */
type ChangeDetectionMode = 'zone' | 'zoneless';

/** One change-detection mode and the providers that select it. */
interface ChangeDetectionCase {
  mode: ChangeDetectionMode;
  providers: Array<Provider | EnvironmentProviders>;
}

/**
 * The change-detection modes a spec can run in here. With zone.js loaded (`nx test`) both run;
 * without it (`nx run <lib>:test-zoneless`) only `zoneless` does, because zone scheduling needs
 * zone.js.
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
          // Zoneless fixtures detect changes like an application does; zone fixtures only do so
          // with auto-detection, so both modes exercise the same scheduling path.
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
 * Declares a `describe` block per change-detection mode. Pass `providers` to
 * `TestBed.configureTestingModule`, so the same assertions run with zone.js scheduling and
 * without it.
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

@Component({
  selector: 'ng-doc-hotkey-fixture',
  template: `
    <button type="button" [ngDocHotkey]="hotkey" (ngDocHotkey)="calls = calls + 1">Run</button>
    <input type="text" />
  `,
  imports: [NgDocHotkeyDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class HotkeyFixtureComponent {
  hotkey: Partial<KeyboardEvent> = { key: 'k', ctrlKey: true };
  calls = 0;
}

/** Dispatches a keyup event on the target. */
function release(target: EventTarget, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keyup', { bubbles: true, cancelable: true, ...init });

  target.dispatchEvent(event);

  return event;
}

describeChangeDetection('NgDocHotkeyDirective', ({ providers }) => {
  beforeEach(() => TestBed.configureTestingModule({ providers }));

  /** Creates the fixture and waits for its first render. */
  async function create() {
    const fixture = TestBed.createComponent(HotkeyFixtureComponent);

    await fixture.whenStable();

    return fixture;
  }

  it('emits when the matching key is released and prevents its default action', async () => {
    const fixture = await create();
    const event = release(document.body, { key: 'k', ctrlKey: true });

    expect(fixture.componentInstance.calls).toBe(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('ignores keys that do not match every given property', async () => {
    const fixture = await create();

    release(document.body, { key: 'k' });
    release(document.body, { key: 'j', ctrlKey: true });

    expect(fixture.componentInstance.calls).toBe(0);
  });

  it('ignores keys released while the reader types in a field', async () => {
    const fixture = await create();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;

    release(input, { key: 'k', ctrlKey: true });

    expect(fixture.componentInstance.calls).toBe(0);
  });

  it('stops listening when it is destroyed', async () => {
    const fixture = await create();
    const instance = fixture.componentInstance;

    fixture.destroy();
    release(document.body, { key: 'k', ctrlKey: true });

    expect(instance.calls).toBe(0);
  });
});
