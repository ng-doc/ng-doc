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
import {
  NgDocPaneBackDirective,
  NgDocPaneComponent,
  NgDocPaneFrontDirective,
} from '@ng-doc/ui-kit/components/pane';
import { NgDocTabComponent, NgDocTabGroupComponent } from '@ng-doc/ui-kit/components/tab-group';
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
  selector: 'ng-doc-tab-group-host',
  template: `
    <ng-doc-tab-group [openedTab]="opened()">
      @for (tab of tabs(); track tab) {
        <ng-doc-tab [id]="tab" [label]="tab" [content]="'Panel ' + tab"></ng-doc-tab>
      }
    </ng-doc-tab-group>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocTabGroupComponent, NgDocTabComponent],
})
class TabGroupHostComponent {
  readonly tabs = signal<string[]>(['HTML', 'TypeScript', 'SCSS']);
  readonly opened = signal<string | undefined>(undefined);
}

@Component({
  selector: 'ng-doc-pane-host',
  template: `
    <ng-doc-pane [expanded]="expanded()" style="display: flex; width: 400px">
      <div ngDocPaneBack>Back</div>
      <div ngDocPaneFront>Front</div>
    </ng-doc-pane>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocPaneComponent, NgDocPaneBackDirective, NgDocPaneFrontDirective],
})
class PaneHostComponent {
  readonly expanded = signal<boolean>(false);
}

describeChangeDetection('NgDocTabGroupComponent', ({ providers }: ChangeDetectionCase) => {
  let fixture: ComponentFixture<TabGroupHostComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers });
    fixture = TestBed.createComponent(TabGroupHostComponent);
    await fixture.whenStable();
  });

  const tabs = (): HTMLButtonElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('[role="tab"]'));
  const panel = (): HTMLElement => fixture.nativeElement.querySelector('[role="tabpanel"]');
  const selected = (): string | undefined =>
    tabs()
      .find((tab: HTMLButtonElement) => tab.getAttribute('aria-selected') === 'true')
      ?.textContent?.trim();

  it('exposes a tablist with one selected tab controlling the panel', () => {
    expect(fixture.nativeElement.querySelector('[role="tablist"]')).not.toBeNull();
    expect(tabs().map((tab: HTMLButtonElement) => tab.getAttribute('tabindex'))).toEqual([
      '0',
      '-1',
      '-1',
    ]);
    expect(selected()).toBe('HTML');
    expect(panel().textContent?.trim()).toBe('Panel HTML');
    expect(panel().getAttribute('aria-labelledby')).toBe(tabs()[0].id);
    expect(tabs()[0].getAttribute('aria-controls')).toBe(panel().id);
  });

  it('opens a tab on click and follows openedTab', async () => {
    tabs()[2].click();
    await fixture.whenStable();

    expect(selected()).toBe('SCSS');
    expect(panel().textContent?.trim()).toBe('Panel SCSS');

    fixture.componentInstance.opened.set('TypeScript');
    await fixture.whenStable();

    expect(selected()).toBe('TypeScript');
  });

  it('moves between tabs with the arrow keys, Home and End', async () => {
    const press = async (key: string): Promise<void> => {
      (document.activeElement ?? tabs()[0]).dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true }),
      );
      await fixture.whenStable();
    };

    tabs()[0].focus();
    await press('ArrowRight');

    expect(selected()).toBe('TypeScript');
    expect(document.activeElement).toBe(tabs()[1]);

    await press('End');
    expect(selected()).toBe('SCSS');

    await press('ArrowRight');
    expect(selected()).toBe('HTML');

    await press('ArrowLeft');
    expect(selected()).toBe('SCSS');

    await press('Home');
    expect(selected()).toBe('HTML');
  });

  it('keeps the open tab while it stays in the group and falls back when it is removed', async () => {
    tabs()[1].click();
    await fixture.whenStable();

    fixture.componentInstance.tabs.set(['HTML', 'TypeScript', 'SCSS', 'JSON']);
    await fixture.whenStable();

    expect(selected()).toBe('TypeScript');

    fixture.componentInstance.tabs.set(['HTML', 'SCSS']);
    await fixture.whenStable();

    expect(selected()).toBe('HTML');
  });
});

describeChangeDetection('NgDocPaneComponent', ({ providers }: ChangeDetectionCase) => {
  let fixture: ComponentFixture<PaneHostComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers });
    fixture = TestBed.createComponent(PaneHostComponent);
    await fixture.whenStable();
  });

  const resizer = (): HTMLElement => fixture.nativeElement.querySelector('.ng-doc-pane-resizer');

  it('exposes the resizer as a focusable separator', () => {
    expect(resizer().getAttribute('role')).toBe('separator');
    expect(resizer().getAttribute('tabindex')).toBe('0');
    expect(resizer().getAttribute('aria-valuenow')).toBe('0');
  });

  it('opens the back pane when expanded and on Enter', async () => {
    // jsdom has no layout: give the pane a width the component can measure.
    const pane: HTMLElement = fixture.nativeElement.querySelector('ng-doc-pane');

    Object.defineProperty(pane, 'offsetWidth', { configurable: true, value: 400 });
    Object.defineProperty(resizer(), 'offsetWidth', { configurable: true, value: 16 });

    fixture.componentInstance.expanded.set(true);
    await fixture.whenStable();

    const back = (): HTMLElement => fixture.nativeElement.querySelector('.ng-doc-pane-back');

    expect(back().style.width).toBe('384px');
    expect(resizer().getAttribute('aria-valuenow')).toBe('100');

    Object.defineProperty(resizer(), 'offsetLeft', { configurable: true, value: 384 });
    resizer().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await fixture.whenStable();

    expect(back().style.width).toBe('0px');
    expect(resizer().getAttribute('aria-valuenow')).toBe('0');
  });
});
