import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
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
import { NgDocBlockquoteComponent } from '@ng-doc/ui-kit/components/blockquote';
import { NgDocBlockquoteType } from '@ng-doc/ui-kit/types';
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
  selector: 'ng-doc-blockquote-host',
  template: `<blockquote ng-doc-blockquote [type]="type()" [icon]="icon()" [label]="label()">
    <p>Body</p>
  </blockquote>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocBlockquoteComponent],
})
class BlockquoteHostComponent {
  readonly type = signal<NgDocBlockquoteType>('note');
  readonly icon = signal<string | undefined>(undefined);
  readonly label = signal<string | undefined>(undefined);
}

describeChangeDetection('NgDocBlockquoteComponent', ({ providers }: ChangeDetectionCase) => {
  let fixture: ComponentFixture<BlockquoteHostComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [...providers, provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(BlockquoteHostComponent);
    await fixture.whenStable();
  });

  const blockquote = (): HTMLElement => fixture.nativeElement.querySelector('blockquote');
  const title = (): string | undefined =>
    blockquote().querySelector('.ng-doc-blockquote-title')?.textContent?.trim();
  const icon = (): string | null | undefined =>
    blockquote()
      .querySelector('.ng-doc-blockquote-icon ng-doc-icon')
      ?.getAttribute('data-ng-doc-size');

  it.each([
    ['note', 'Note'],
    ['warning', 'Warning'],
    ['alert', 'Alert'],
    ['success', 'Success'],
  ] as const)('titles a %s callout "%s" and shows its icon', async (type, label) => {
    fixture.componentInstance.type.set(type);
    await fixture.whenStable();

    expect(blockquote().getAttribute('data-ng-doc-type')).toBe(type);
    expect(blockquote().hasAttribute('data-ng-doc-has-icon')).toBe(true);
    expect(title()).toBe(label);
    // The icon set ships the callout icons at 24px only.
    expect(icon()).toBe('24');
    // The title comes before the projected content, so it is read first.
    expect(blockquote().querySelector('.ng-doc-blockquote')?.textContent?.trim()).toBe(
      `${label}Body`,
    );
  });

  it('shows neither an icon nor a title for the default type', async () => {
    fixture.componentInstance.type.set('default');
    await fixture.whenStable();

    expect(blockquote().getAttribute('data-ng-doc-type')).toBe('default');
    expect(blockquote().hasAttribute('data-ng-doc-has-icon')).toBe(false);
    expect(title()).toBeUndefined();
    expect(icon()).toBeUndefined();
  });

  it('replaces the icon and leaves the title to the content with a custom icon', async () => {
    fixture.componentInstance.icon.set('activity');
    await fixture.whenStable();

    expect(blockquote().querySelector('.ng-doc-blockquote-icon ng-doc-icon')).not.toBeNull();
    expect(title()).toBeUndefined();

    fixture.componentInstance.icon.set(undefined);
    await fixture.whenStable();

    expect(title()).toBe('Note');
  });

  it('shows its label as the title, with a custom icon too', async () => {
    fixture.componentInstance.icon.set('activity');
    fixture.componentInstance.label.set('Deprecated');
    await fixture.whenStable();

    expect(title()).toBe('Deprecated');
    expect(blockquote().querySelector('.ng-doc-blockquote')?.textContent?.trim()).toBe(
      'DeprecatedBody',
    );

    fixture.componentInstance.icon.set(undefined);
    await fixture.whenStable();

    expect(title()).toBe('Deprecated');
  });

  it('hides the icon from assistive technology', () => {
    expect(blockquote().querySelector('.ng-doc-blockquote-icon')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
  });

  it('accepts the inputs through setInput, as the page processor sets them', async () => {
    const ref = TestBed.createComponent(NgDocBlockquoteComponent);

    ref.componentRef.setInput('type', 'warning');
    await ref.whenStable();

    expect(ref.nativeElement.getAttribute('data-ng-doc-type')).toBe('warning');
    expect(ref.nativeElement.querySelector('.ng-doc-blockquote-title')?.textContent?.trim()).toBe(
      'Warning',
    );
  });
});
