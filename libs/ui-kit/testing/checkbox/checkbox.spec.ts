import {
  ChangeDetectionStrategy,
  Component,
  EnvironmentProviders,
  Provider,
  provideZoneChangeDetection,
  provideZonelessChangeDetection,
  signal,
} from '@angular/core';
import { ComponentFixture, ComponentFixtureAutoDetect, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NgDocCheckboxComponent } from '@ng-doc/ui-kit/components/checkbox';
import { NgDocIconRegistry } from '@ng-doc/ui-kit/components/icon';
import { beforeEach, describe, expect, it } from 'vitest';

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
 * The change-detection modes a spec can run in: both with zone.js loaded, only `zoneless` without.
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

@Component({
  selector: 'ng-doc-checkbox-host',
  template: `
    <button type="button" class="before">Before</button>
    <ng-doc-checkbox [(ngModel)]="value">Recreate</ng-doc-checkbox>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocCheckboxComponent, FormsModule],
})
class CheckboxHostComponent {
  readonly value = signal<boolean>(false);
}

describeChangeDetection('NgDocCheckboxComponent keyboard access', ({ providers }) => {
  let fixture: ComponentFixture<CheckboxHostComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        ...providers,
        // The checkbox shows icons; the spec does not need their markup.
        {
          provide: NgDocIconRegistry,
          useValue: { get: () => signal(''), retry: () => void 0 },
        },
      ],
    });
    fixture = TestBed.createComponent(CheckboxHostComponent);
    await fixture.whenStable();
  });

  const input = (): HTMLInputElement =>
    fixture.nativeElement.querySelector('ng-doc-checkbox input[type="checkbox"]');

  it('keeps its native input in the tab order', () => {
    expect(input().tabIndex).toBe(0);
    expect(input().hasAttribute('tabindex')).toBe(false);

    input().focus();

    expect(document.activeElement).toBe(input());
  });

  it('toggles with the keyboard (Space on the focused input)', async () => {
    input().focus();
    // A browser turns Space on a focused checkbox into a click.
    input().click();
    await fixture.whenStable();

    expect(fixture.componentInstance.value()).toBe(true);
    expect(
      fixture.nativeElement.querySelector('ng-doc-checkbox').getAttribute('aria-checked'),
    ).toBe('true');
  });
});
