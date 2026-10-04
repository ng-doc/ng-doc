import { Clipboard } from '@angular/cdk/clipboard';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { NgDocTocComponent } from '@ng-doc/app/components/toc';
import { NgDocTocItem } from '@ng-doc/app/interfaces';
import { NgDocShortcutsService } from '@ng-doc/app/services/shortcuts';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { describeChangeDetection } from '../change-detection/change-detection-modes';

interface FakeHeading {
  item: NgDocTocItem;
  top: number;
}

/**
 * Creates headings whose position in the viewport the test controls.
 * @param titles - Titles of the headings, from the top of the page.
 * @returns The headings.
 */
function headings(titles: string[]): FakeHeading[] {
  return titles.map((title, index) => {
    const element = document.createElement('h2');
    const heading: FakeHeading = {
      top: 0,
      item: { title, path: '/page', hash: `h${index}`, element, level: index === 2 ? 2 : 1 },
    };

    element.getBoundingClientRect = () => ({ top: heading.top }) as DOMRect;

    return heading;
  });
}

/**
 * Sets the page scroll position and size the way a browser reports them.
 * @param scrollY - The scroll offset.
 * @param scrollHeight - The height of the document.
 */
function setScroll(scrollY: number, scrollHeight: number): void {
  Object.defineProperty(window, 'scrollY', { configurable: true, value: scrollY });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 });
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    configurable: true,
    value: scrollHeight,
  });
}

/** Waits for the next animation frame. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

describeChangeDetection('NgDocTocComponent', ({ providers }) => {
  let fixture: ComponentFixture<NgDocTocComponent>;
  let items: FakeHeading[];
  const copy = vi.fn();

  /** Runs change detection and waits for the fixture to settle. */
  async function stable(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  /**
   * Scrolls to a position and lets the rail react to the scroll event.
   * @param scrollY - The scroll offset.
   */
  async function scroll(scrollY: number): Promise<void> {
    setScroll(scrollY, 3000);
    items.forEach((heading, index) => (heading.top = index * 800 - scrollY + 50));
    window.dispatchEvent(new Event('scroll'));
    await nextFrame();
    await stable();
  }

  /**
   * Moves the page and fires a scroll event without rendering, as after the rail is gone.
   * @param scrollY - The scroll offset.
   */
  async function scrollWithoutRender(scrollY: number): Promise<void> {
    setScroll(scrollY, 3000);
    items.forEach((heading, index) => (heading.top = index * 800 - scrollY + 50));
    window.dispatchEvent(new Event('scroll'));
    await nextFrame();
  }

  /** @returns The titles of the selected entries. */
  function selected(): string[] {
    return Array.from<HTMLElement>(
      fixture.nativeElement.querySelectorAll('li[data-ng-doc-selected="true"]'),
    ).map((li) => li.textContent?.trim() ?? '');
  }

  beforeEach(async () => {
    copy.mockReset();
    setScroll(0, 3000);
    TestBed.configureTestingModule({
      providers: [...providers, provideRouter([]), { provide: Clipboard, useValue: { copy } }],
    });
    items = headings(['Intro', 'Usage', 'Details', 'API']);
    items.forEach((heading, index) => (heading.top = index * 800 + 200));
    fixture = TestBed.createComponent(NgDocTocComponent);
    fixture.componentRef.setInput(
      'tableOfContent',
      items.map(({ item }) => item),
    );
    await stable();
  });

  afterEach(() => setScroll(0, 0));

  it('lists the headings under an "On this page" label with a hidden marker item', () => {
    const nav: HTMLElement = fixture.nativeElement.querySelector('nav');
    const list: HTMLElement = nav.querySelector('ul')!;

    expect(nav.getAttribute('aria-label')).toBe('On this page');
    expect(list.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
    expect(list.querySelectorAll('li[ng-doc-toc-element]')).toHaveLength(4);
    expect(list.querySelectorAll('li[data-ng-doc-level="2"]')).toHaveLength(1);
    expect(selected()).toEqual(['Intro']);
    expect(nav.querySelector('a[aria-current="location"]')?.textContent?.trim()).toBe('Intro');
  });

  it('follows the section the reader scrolls to and reports the progress', async () => {
    await scroll(900);

    expect(selected()).toEqual(['Usage']);
    expect(fixture.componentInstance.activeItem()?.title).toBe('Usage');

    const progress: HTMLElement = fixture.nativeElement.querySelector('[role="progressbar"]');

    expect(progress.getAttribute('aria-valuenow')).toBe('45');
    expect(fixture.nativeElement.querySelector('.ng-doc-toc-percent').textContent).toBe('45%');

    await scroll(2000);

    expect(selected()).toEqual(['API']);
    expect(progress.getAttribute('aria-valuenow')).toBe('100');
  });

  it('starts a new table of contents at its first heading', async () => {
    await scroll(1700);
    expect(selected()).toEqual(['Details']);

    items = headings(['Other', 'Page']);
    items.forEach((heading, index) => (heading.top = index * 800 + 200));
    setScroll(0, 3000);
    fixture.componentRef.setInput(
      'tableOfContent',
      items.map(({ item }) => item),
    );
    await stable();

    expect(selected()).toEqual(['Other']);
  });

  it('copies the page link and says so', async () => {
    const button: HTMLButtonElement = Array.from<HTMLButtonElement>(
      fixture.nativeElement.querySelectorAll('button'),
    ).find((candidate) => candidate.textContent?.includes('Copy link'))!;

    button.click();
    await stable();

    expect(copy).toHaveBeenCalledWith(location.origin + location.pathname);
    expect(button.textContent).toContain('Copied');
  });

  it('copies the page link and says so when the reader presses L', async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', bubbles: true }));
    await stable();

    expect(copy).toHaveBeenCalledWith(location.origin + location.pathname);
    expect(fixture.nativeElement.textContent).toContain('Copied');
  });

  it('gives L back to the built-in shortcut once destroyed', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    try {
      fixture.destroy();
      TestBed.inject(NgDocShortcutsService).run('l');

      expect(copy).not.toHaveBeenCalled();
      expect(writeText).toHaveBeenCalledWith(location.href);
    } finally {
      if (clipboard) {
        Object.defineProperty(navigator, 'clipboard', clipboard);
      } else {
        delete (navigator as { clipboard?: unknown }).clipboard;
      }
    }
  });

  it('scrolls back to the top', async () => {
    const scrollTo = vi.fn();

    window.scrollTo = scrollTo;
    Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('button'))
      .find((candidate) => candidate.textContent?.includes('Back to top'))!
      .click();

    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
  });

  it('shows Edit this page only with a source URL', async () => {
    expect(fixture.nativeElement.textContent).not.toContain('Edit this page');

    fixture.componentRef.setInput('editSourceFileUrl', 'https://example.com/edit');
    await stable();

    const edit: HTMLAnchorElement = fixture.nativeElement.querySelector('a[target="_blank"]');

    expect(edit.textContent).toContain('Edit this page');
    expect(edit.href).toBe('https://example.com/edit');
  });

  it('shows the symbol details it is given above the headings', async () => {
    expect(fixture.nativeElement.querySelector('.ng-doc-toc-details')).toBeNull();

    const details = document.createElement('dl');

    details.innerHTML = '<dt>Kind</dt><dd>Class</dd>';
    fixture.componentRef.setInput('details', details);
    await stable();

    const section: HTMLElement = fixture.nativeElement.querySelector('.ng-doc-toc-details');

    expect(section.getAttribute('aria-label')).toBe('Symbol');
    expect(section.querySelector('dl')).toBe(details);
    expect(section.textContent).toContain('Kind');
  });

  it('stops tracking once destroyed', async () => {
    const instance = fixture.componentInstance;

    fixture.destroy();
    await scrollWithoutRender(900);

    expect(instance.activeItem()?.title).toBe('Intro');
  });

  it('keeps tracking while alive, as the destroyed case assumes', async () => {
    await scrollWithoutRender(900);

    expect(fixture.componentInstance.activeItem()?.title).toBe('Usage');
  });

  it('reports a page shorter than the viewport as read in full', async () => {
    setScroll(0, 800);
    window.dispatchEvent(new Event('scroll'));
    await nextFrame();
    await stable();

    expect(fixture.nativeElement.querySelector('.ng-doc-toc-percent').textContent).toBe('100%');
  });

  it('keeps a clicked section near the end active until the reader scrolls', async () => {
    await scroll(2000);
    expect(selected()).toEqual(['API']);

    const details: HTMLAnchorElement = fixture.nativeElement.querySelectorAll(
      'li[ng-doc-toc-element] a',
    )[2];

    details.click();
    await stable();
    // The jump cannot bring the heading to the top, so the page stays at its end and scrolls.
    await scroll(2000);

    expect(selected()).toEqual(['Details']);

    window.dispatchEvent(new Event('wheel'));
    await nextFrame();
    await stable();

    expect(selected()).toEqual(['API']);
  });

  it('marks the heading of a fragment the router navigates to', async () => {
    await TestBed.inject(Router).navigateByUrl('/#h1');
    await scroll(0);

    expect(selected()).toEqual(['Usage']);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }));
    await scroll(0);
    expect(selected()).toEqual(['Usage']);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    await nextFrame();
    await stable();
    expect(selected()).toEqual(['Intro']);
  });

  it('does not track while the rail is hidden', async () => {
    const rail = fixture.nativeElement as HTMLElement & { checkVisibility?: () => boolean };

    rail.checkVisibility = () => false;
    await scroll(900);

    expect(selected()).toEqual(['Intro']);
    expect(fixture.nativeElement.querySelector('.ng-doc-toc-percent').textContent).toBe('0%');
  });
});
