import { ChangeDetectionStrategy, Component, signal, viewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NgDocMembersFilterDirective } from '@ng-doc/app/directives/members-filter';
import { NgDocShortcutsService } from '@ng-doc/app/services/shortcuts';
import { NgDocThemeService } from '@ng-doc/app/services/theme';
import { WA_LOCAL_STORAGE } from '@ng-web-apis/common';
import { beforeEach, expect, it, vi } from 'vitest';

import { describeChangeDetection } from '../change-detection/change-detection-modes';

class MemoryStorage {
  getItem(): string | null {
    return null;
  }

  setItem(): void {
    // The specs do not read the choice back.
  }
}

// The markup contract of the API page members table (rendered by the page, not by Angular).
@Component({
  template: `
    <section ngDocMembersFilter>
      <div class="ng-doc-members-bar">
        <div class="ng-doc-members-tabs" role="tablist" aria-label="Members">
          <button type="button" role="tab" data-ng-doc-members-tab="all">
            All <span class="ng-doc-members-count"></span>
          </button>
          <button type="button" role="tab" data-ng-doc-members-tab="properties">
            Properties <span class="ng-doc-members-count"></span>
          </button>
          <button type="button" role="tab" data-ng-doc-members-tab="accessors">
            Accessors <span class="ng-doc-members-count"></span>
          </button>
          <button type="button" role="tab" data-ng-doc-members-tab="methods">
            Methods <span class="ng-doc-members-count"></span>
          </button>
          <button type="button" role="tab" data-ng-doc-members-tab="inherited">
            Inherited <span class="ng-doc-members-count"></span>
          </button>
        </div>
        <label class="ng-doc-members-filter">
          <input type="text" data-ng-doc-members-filter aria-label="Filter members by name" />
        </label>
      </div>
      <table class="ng-doc-members-table">
        <tbody>
          <tr class="ng-doc-members-group" data-group="properties">
            <td colspan="2">Properties <span class="ng-doc-members-count"></span></td>
          </tr>
          <tr class="ng-doc-member" data-group="properties" data-name="content">
            <td>content</td>
          </tr>
          <tr class="ng-doc-member" data-group="properties" data-name="title" data-inherited>
            <td>title</td>
          </tr>
          <tr class="ng-doc-members-group" data-group="methods">
            <td colspan="2">Methods <span class="ng-doc-members-count"></span></td>
          </tr>
          <tr class="ng-doc-member" data-group="methods" data-name="ngOnInit">
            <td>
              <button
                type="button"
                class="ng-doc-member-expand"
                aria-expanded="false"
                aria-controls="member-ngOnInit">
                ngOnInit
              </button>
            </td>
          </tr>
          <tr class="ng-doc-member-detail" id="member-ngOnInit">
            <td colspan="2">Signature</td>
          </tr>
        </tbody>
      </table>
      <p class="ng-doc-members-empty">No members match.</p>
    </section>
  `,
  imports: [NgDocMembersFilterDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class MembersHostComponent {
  readonly filter = viewChild.required(NgDocMembersFilterDirective);
}

// A members table with a single group renders no tabs.
@Component({
  template: `
    <section ngDocMembersFilter>
      <table class="ng-doc-members-table">
        <tbody>
          <tr class="ng-doc-member" data-group="properties" data-name="content">
            <td>content</td>
          </tr>
        </tbody>
      </table>
    </section>
  `,
  imports: [NgDocMembersFilterDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class MembersWithoutTabsHostComponent {}

/**
 * Gives an element the layout that `ng-doc-selection` measures (jsdom has none).
 * @param element - The element.
 * @param left - `offsetLeft`.
 * @param width - `offsetWidth`.
 */
function layout(element: HTMLElement, left: number, width: number): void {
  Object.defineProperties(element, {
    offsetLeft: { configurable: true, value: left },
    offsetTop: { configurable: true, value: 3 },
    offsetWidth: { configurable: true, value: width },
    offsetHeight: { configurable: true, value: 28 },
  });
}

/**
 * Waits until the highlight has rendered after a change.
 * @param fixture - The fixture of the test.
 */
async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
}

describeChangeDetection('NgDocMembersFilterDirective', ({ providers }) => {
  let fixture: ComponentFixture<MembersHostComponent>;
  let element: HTMLElement;

  const tab = (name: string) =>
    element.querySelector<HTMLButtonElement>(`[data-ng-doc-members-tab="${name}"]`)!;
  const shown = () =>
    [...element.querySelectorAll<HTMLElement>('.ng-doc-member')]
      .filter((row) => !row.hidden)
      .map((row) => row.dataset['name']);
  const groupHidden = (group: string) =>
    element.querySelector<HTMLElement>(`.ng-doc-members-group[data-group="${group}"]`)!.hidden;
  const detail = () => element.querySelector<HTMLElement>('#member-ngOnInit')!;
  const empty = () => element.querySelector<HTMLElement>('.ng-doc-members-empty')!;
  const input = () => element.querySelector<HTMLInputElement>('[data-ng-doc-members-filter]')!;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        providers,
        { provide: WA_LOCAL_STORAGE, useValue: new MemoryStorage() },
        { provide: NgDocThemeService, useValue: { theme: signal(null), set: vi.fn() } },
      ],
    });
    fixture = TestBed.createComponent(MembersHostComponent);
    element = fixture.nativeElement;
    await fixture.whenStable();
  });

  it('counts the members of every tab and disables the empty ones', () => {
    const counts = ['all', 'properties', 'accessors', 'methods', 'inherited'].map(
      (name) => tab(name).querySelector('.ng-doc-members-count')?.textContent,
    );

    expect(counts).toEqual(['3', '2', '0', '1', '1']);
    expect(tab('accessors').disabled).toBe(true);
    expect(tab('all').disabled).toBe(false);
  });

  it('starts on All, with one tab stop, every member and the details collapsed', () => {
    expect(tab('all').getAttribute('aria-selected')).toBe('true');
    expect(tab('all').tabIndex).toBe(0);
    expect(tab('methods').tabIndex).toBe(-1);
    expect(shown()).toEqual(['content', 'title', 'ngOnInit']);
    expect(detail().hidden).toBe(true);
    expect(empty().hidden).toBe(true);
  });

  it('shows the members of the selected tab and hides empty groups', () => {
    tab('methods').click();

    expect(tab('methods').getAttribute('aria-selected')).toBe('true');
    expect(tab('all').getAttribute('aria-selected')).toBe('false');
    expect(shown()).toEqual(['ngOnInit']);
    expect(groupHidden('properties')).toBe(true);
    expect(groupHidden('methods')).toBe(false);
    expect(fixture.componentInstance.filter().tab()).toBe('methods');

    tab('inherited').click();

    expect(shown()).toEqual(['title']);
  });

  it('moves between enabled tabs with the arrow keys, Home and End', () => {
    const press = (key: string) =>
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
      );

    tab('all').focus();
    press('ArrowRight');
    expect(document.activeElement).toBe(tab('properties'));
    press('ArrowRight');
    expect(document.activeElement).toBe(tab('methods'));
    expect(shown()).toEqual(['ngOnInit']);
    press('End');
    expect(document.activeElement).toBe(tab('inherited'));
    press('ArrowRight');
    expect(document.activeElement).toBe(tab('all'));
    press('ArrowLeft');
    expect(document.activeElement).toBe(tab('inherited'));
    press('Home');
    expect(tab('all').getAttribute('aria-selected')).toBe('true');
  });

  it('filters members by name, updates the group counts and shows the empty note', () => {
    input().value = 'CON';
    input().dispatchEvent(new Event('input', { bubbles: true }));

    expect(shown()).toEqual(['content']);
    expect(
      element.querySelector('.ng-doc-members-group[data-group="properties"] .ng-doc-members-count')
        ?.textContent,
    ).toBe('1');
    expect(groupHidden('methods')).toBe(true);

    fixture.componentInstance.filter().filter('zzz');

    expect(input().value).toBe('zzz');
    expect(shown()).toEqual([]);
    expect(empty().hidden).toBe(false);
  });

  it('expands a method row and hides its detail with the row', () => {
    const expand = element.querySelector<HTMLButtonElement>('.ng-doc-member-expand')!;

    expand.click();

    expect(expand.getAttribute('aria-expanded')).toBe('true');
    expect(detail().hidden).toBe(false);

    tab('properties').click();

    expect(detail().hidden).toBe(true);

    tab('all').click();
    expand.click();

    expect(detail().hidden).toBe(true);
  });

  it('inserts one highlight in front of the tabs, placed once a tab has a box', () => {
    const row = element.querySelector<HTMLElement>('.ng-doc-members-tabs')!;
    const highlights = row.querySelectorAll('ng-doc-selection');

    expect(highlights).toHaveLength(1);
    expect(row.firstElementChild).toBe(highlights[0]);
    expect(highlights[0].getAttribute('aria-hidden')).toBe('true');
    // A thumb that covers the tab, without a border on one side.
    expect(highlights[0].hasAttribute('data-ng-doc-align')).toBe(false);
    // jsdom lays nothing out: the selected tab keeps drawing its own background.
    expect(highlights[0].hasAttribute('data-ng-doc-placed')).toBe(false);
  });

  it('slides the highlight to the tab selected by a click or a key', async () => {
    const highlight = element.querySelector<HTMLElement>('ng-doc-selection')!;

    ['all', 'properties', 'accessors', 'methods', 'inherited'].forEach((name, index) =>
      layout(tab(name), 3 + index * 80, 70 + index),
    );

    tab('methods').click();
    await settle(fixture);

    expect(highlight.style.transform).toBe('translate(243px, 3px)');
    expect(highlight.style.width).toBe('73px');
    expect(highlight.style.height).toBe('28px');
    expect(highlight.style.visibility).toBe('visible');
    expect(highlight.hasAttribute('data-ng-doc-placed')).toBe(true);

    tab('methods').focus();
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }),
    );
    await settle(fixture);

    expect(highlight.style.transform).toBe('translate(3px, 3px)');
    expect(highlight.style.width).toBe('70px');

    fixture.componentInstance.filter().select('inherited');
    await settle(fixture);

    expect(highlight.style.transform).toBe('translate(323px, 3px)');
  });

  it('removes the highlight when destroyed', () => {
    const row = element.querySelector<HTMLElement>('.ng-doc-members-tabs')!;

    fixture.destroy();

    expect(row.querySelector('ng-doc-selection')).toBeNull();
  });

  it('adds no highlight to a table without tabs', async () => {
    const withoutTabs = TestBed.createComponent(MembersWithoutTabsHostComponent);

    await withoutTabs.whenStable();

    expect(withoutTabs.nativeElement.querySelector('ng-doc-selection')).toBeNull();
  });

  it('focuses the filter with F and gives the key back when destroyed', () => {
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'f', bubbles: true, cancelable: true }),
    );

    expect(document.activeElement).toBe(input());

    fixture.destroy();

    expect(TestBed.inject(NgDocShortcutsService).run('f')).toBe(false);
  });
});
