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
import { NgDocTagComponent } from '@ng-doc/ui-kit/components/tag';
import { NgDocColor, NgDocTagSize } from '@ng-doc/ui-kit/types';
import { describe, expect, it } from 'vitest';

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
  selector: 'ng-doc-tag-host',
  template: `<ng-doc-tag [color]="color()" [size]="size()" [mod]="mod()">New</ng-doc-tag>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocTagComponent],
})
class TagHostComponent {
  readonly color = signal<NgDocColor>('primary');
  readonly size = signal<NgDocTagSize>('medium');
  readonly mod = signal<'default' | 'light'>('default');
}

describeChangeDetection('NgDocTagComponent', ({ providers }: ChangeDetectionCase) => {
  it('reflects its inputs as attributes the styles are keyed to', async () => {
    TestBed.configureTestingModule({ providers });

    const fixture: ComponentFixture<TagHostComponent> = TestBed.createComponent(TagHostComponent);

    await fixture.whenStable();

    const tag: HTMLElement = fixture.nativeElement.querySelector('ng-doc-tag');

    expect(tag.textContent?.trim()).toBe('New');
    expect(tag.getAttribute('data-ng-doc-color')).toBe('primary');
    expect(tag.getAttribute('data-ng-doc-size')).toBe('medium');
    expect(tag.getAttribute('data-ng-doc-mod')).toBe('default');

    fixture.componentInstance.color.set('success');
    fixture.componentInstance.size.set('small');
    fixture.componentInstance.mod.set('light');
    await fixture.whenStable();

    expect(tag.getAttribute('data-ng-doc-color')).toBe('success');
    expect(tag.getAttribute('data-ng-doc-size')).toBe('small');
    expect(tag.getAttribute('data-ng-doc-mod')).toBe('light');
  });
});
