import {
  ChangeDetectionStrategy,
  Component,
  EnvironmentProviders,
  Provider,
  provideZoneChangeDetection,
  provideZonelessChangeDetection,
  signal,
} from '@angular/core';
import { ComponentFixtureAutoDetect, TestBed } from '@angular/core/testing';
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
  selector: 'ng-doc-counter-fixture',
  template: `<button type="button" (click)="increment()">{{ count() }}</button>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class CounterFixtureComponent {
  protected readonly count = signal(0);

  increment(): void {
    this.count.update((value: number) => value + 1);
  }

  later(): void {
    setTimeout(() => this.increment());
  }
}

describe('changeDetectionCases', () => {
  it('runs both modes with zone.js and only zoneless without it', () => {
    const zoneLoaded = typeof (globalThis as { Zone?: unknown }).Zone !== 'undefined';

    expect(changeDetectionCases().map((testCase) => testCase.mode)).toEqual(
      zoneLoaded ? ['zone', 'zoneless'] : ['zoneless'],
    );
  });
});

describeChangeDetection('a signal-driven OnPush component', ({ providers }) => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers });
  });

  it('renders after a DOM event', async () => {
    const fixture = TestBed.createComponent(CounterFixtureComponent);
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');

    await fixture.whenStable();
    button.click();
    await fixture.whenStable();

    expect(button.textContent).toBe('1');
  });

  it('renders after a timer, without a manual detectChanges', async () => {
    const fixture = TestBed.createComponent(CounterFixtureComponent);

    await fixture.whenStable();
    fixture.componentInstance.later();
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toBe('1');
  });
});
