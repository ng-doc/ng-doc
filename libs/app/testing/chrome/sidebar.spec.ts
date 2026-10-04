import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { NgDocSidebarComponent } from '@ng-doc/app/components/sidebar';
import { NgDocNavigation } from '@ng-doc/app/interfaces';
import { NG_DOC_CONTEXT } from '@ng-doc/app/tokens';
import { beforeEach, expect, it } from 'vitest';

import { describeChangeDetection } from '../change-detection/change-detection-modes';

@Component({
  selector: 'ng-doc-empty-page',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class EmptyPageComponent {}

const NAVIGATION: NgDocNavigation[] = [
  {
    title: 'Getting started',
    route: '/docs/getting-started',
    expandable: true,
    children: [{ title: 'Installation', route: '/docs/getting-started/installation' }],
  },
  {
    title: 'Writing content',
    route: '/docs/writing-content',
    expandable: true,
    children: [
      {
        title: 'Blockquotes',
        route: '/docs/writing-content/blockquotes',
        metadata: { description: '', tags: { status: [':success NEW STYLES'] } },
      },
      {
        title: 'Mermaid',
        route: '/docs/writing-content/mermaid',
        metadata: { description: '', tags: { status: [':info NEW', 'UPDATED'] } },
      },
    ],
  },
  { title: 'API References', route: '/docs/api' },
];

describeChangeDetection('NgDocSidebarComponent', ({ providers }) => {
  let fixture: ComponentFixture<NgDocSidebarComponent>;

  /** Runs change detection and waits for the fixture to settle. */
  async function stable(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  /**
   * Finds the header button of a category.
   * @param title - The category title.
   * @returns The button.
   */
  function categoryButton(title: string): HTMLButtonElement {
    const buttons = Array.from<HTMLButtonElement>(
      fixture.nativeElement.querySelectorAll('button.ng-doc-sidebar-category-button'),
    );

    return buttons.find((button) => button.textContent?.trim() === title)!;
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        ...providers,
        provideRouter([{ path: '**', component: EmptyPageComponent }]),
        { provide: NG_DOC_CONTEXT, useValue: { navigation: NAVIGATION } },
      ],
    });
    await TestBed.inject(Router).navigateByUrl('/docs/writing-content/blockquotes');
    fixture = TestBed.createComponent(NgDocSidebarComponent);
    await stable();
  });

  it('is a navigation landmark', () => {
    const nav: HTMLElement = fixture.nativeElement.querySelector('nav');

    expect(nav.getAttribute('aria-label')).toBe('Documentation');
  });

  it('opens the category of the current page and links its header to the pages', () => {
    const open = categoryButton('Writing content');
    const closed = categoryButton('Getting started');

    expect(open.getAttribute('aria-expanded')).toBe('true');
    expect(closed.getAttribute('aria-expanded')).toBe('false');

    const children = fixture.nativeElement.querySelector(
      `#${open.getAttribute('aria-controls')}`,
    ) as HTMLElement;

    expect(children.textContent).toContain('Blockquotes');
  });

  it('expands and collapses a category from its header', async () => {
    const button = categoryButton('Getting started');

    button.click();
    await stable();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.closest('ng-doc-sidebar-category')?.getAttribute('data-ng-doc-expanded')).toBe(
      'true',
    );

    button.click();
    await stable();
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens a closed category when the reader navigates to one of its pages', async () => {
    const button = categoryButton('Getting started');

    await TestBed.inject(Router).navigateByUrl('/docs/getting-started/installation');
    await stable();

    expect(button.getAttribute('aria-expanded')).toBe('true');
  });

  it('marks the current page and shows quiet status badges in sentence case', () => {
    const current: HTMLAnchorElement =
      fixture.nativeElement.querySelector('a[aria-current="page"]');

    expect(current.textContent).toContain('Blockquotes');

    const badges = Array.from<HTMLElement>(
      fixture.nativeElement.querySelectorAll('.ng-doc-sidebar-status'),
    ).map((badge) => [badge.textContent?.trim(), badge.getAttribute('data-ng-doc-color')]);

    expect(badges).toEqual([
      ['New styles', 'success'],
      ['New', 'info'],
      ['Updated', 'success'],
    ]);
  });

  it('gives a top-level page the header style', () => {
    const items = Array.from<HTMLElement>(
      fixture.nativeElement.querySelectorAll('ng-doc-sidebar-item'),
    );
    const api = items.find((item) => item.textContent?.includes('API References'))!;
    const nested = items.find((item) => item.textContent?.includes('Blockquotes'))!;

    expect(api.getAttribute('data-ng-doc-is-root')).toBe('true');
    expect(nested.getAttribute('data-ng-doc-is-root')).toBe('false');
  });

  it('keeps keyboard focus on the visible rows only', async () => {
    const focusable = (): string[] =>
      Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('a[href], button'))
        .filter((element) => !element.closest('[inert]'))
        .map((element) => element.textContent?.trim() ?? '');

    expect(focusable()).toEqual([
      'Getting started',
      'Writing content',
      'BlockquotesNew styles',
      'MermaidNewUpdated',
      'API References',
    ]);

    const button = categoryButton('Getting started');

    button.focus();
    expect(document.activeElement).toBe(button);
    expect(button.type).toBe('button');

    button.click();
    await stable();

    expect(focusable()).toContain('Installation');
    expect(document.activeElement).toBe(button);
  });
});
