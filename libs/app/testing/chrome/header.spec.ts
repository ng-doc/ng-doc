import { ChangeDetectionStrategy, Component, inject, NgZone } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { NgDocNavbarComponent } from '@ng-doc/app/components/navbar';
import { NgDocRootComponent } from '@ng-doc/app/components/root';
import { NgDocThemeToggleComponent } from '@ng-doc/app/components/theme-toggle';
import { NgDocSidebarService } from '@ng-doc/app/services/sidebar';
import { NgDocThemeService } from '@ng-doc/app/services/theme';
import { NgDocSidenavComponent } from '@ng-doc/ui-kit';
import { WA_LOCAL_STORAGE } from '@ng-web-apis/common';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { describeChangeDetection } from '../change-detection/change-detection-modes';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

@Component({
  selector: 'ng-doc-header-host',
  imports: [NgDocRootComponent, NgDocNavbarComponent],
  template: `
    <ng-doc-root>
      <ng-doc-navbar [search]="false">
        <a ngDocNavbarLeft href="/">Brand</a>
        <nav ngDocNavbarCenter aria-label="Primary"><a href="/docs">Guides</a></nav>
        <button ngDocNavbarRight type="button">Right</button>
      </ng-doc-navbar>
      <nav class="test-sidebar" ngDocCustomSidebar><a href="/docs/a">Page A</a></nav>
      <p class="test-page">Page</p>
    </ng-doc-root>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class HeaderHostComponent {
  readonly sidebar = inject(NgDocSidebarService);
}

/**
 * Resizes the jsdom viewport and reports it like a browser does.
 * @param width - The new viewport width.
 */
function setViewportWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  window.dispatchEvent(new Event('resize'));
}

describeChangeDetection('NgDoc header', ({ providers }) => {
  const initialWidth = window.innerWidth;

  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
    TestBed.configureTestingModule({
      providers: [
        ...providers,
        provideRouter([]),
        { provide: WA_LOCAL_STORAGE, useValue: new MemoryStorage() },
      ],
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: initialWidth });
    document.documentElement.removeAttribute('data-theme');
  });

  /**
   * Renders the header host at a viewport width.
   * @param width - The viewport width.
   * @returns The host element, its component and a helper that settles change detection.
   */
  async function render(width: number): Promise<{
    element: HTMLElement;
    host: HeaderHostComponent;
    stable: () => Promise<void>;
  }> {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    const fixture = TestBed.createComponent(HeaderHostComponent);
    const stable = async (): Promise<void> => {
      fixture.detectChanges();
      await fixture.whenStable();
    };

    await stable();

    return { element: fixture.nativeElement, host: fixture.componentInstance, stable };
  }

  it('makes the skip link the first focus stop and moves focus to the page with it', async () => {
    const { element, stable } = await render(1280);
    const focusable = element.querySelectorAll<HTMLElement>('a[href], button');
    const skip = focusable[0];

    expect(skip.classList).toContain('ng-doc-skip-link');
    expect(skip.textContent?.trim()).toBe('Skip to content');

    skip.click();
    await stable();

    const content = element.querySelector<HTMLElement>('#ng-doc-content');

    expect(document.activeElement).toBe(content);
    expect(content?.querySelector('.test-page')).not.toBeNull();
  });

  it('projects the navbar slots in order', async () => {
    const { element } = await render(1280);
    const texts = Array.from(element.querySelectorAll('.ng-doc-navbar-container > div'), (slot) =>
      slot.textContent?.trim(),
    );

    expect(texts).toEqual(['Brand', 'Guides', 'Right']);
  });

  it('opens the sidebar overlay from the menu button and reports it', async () => {
    const { element, host, stable } = await render(600);
    const menu = element.querySelector<HTMLButtonElement>('button.ng-doc-menu')!;

    expect(menu.getAttribute('aria-controls')).toBe('ng-doc-sidenav');
    expect(element.querySelector('#ng-doc-sidenav')).not.toBeNull();
    expect(menu.getAttribute('aria-expanded')).toBe('false');
    expect(menu.getAttribute('aria-label')).toBe('Open navigation');

    menu.click();
    await stable();

    expect(host.sidebar.expandedState()).toBe(true);
    expect(menu.getAttribute('aria-expanded')).toBe('true');
    expect(menu.getAttribute('aria-label')).toBe('Close navigation');
    expect(element.querySelector('ng-doc-sidenav')?.getAttribute('data-ng-doc-opened')).toBe(
      'true',
    );
  });

  it('closes the sidebar overlay on Escape and returns focus to the menu button', async () => {
    const { element, host, stable } = await render(600);
    const menu = element.querySelector<HTMLButtonElement>('button.ng-doc-menu')!;

    menu.click();
    await stable();
    element.querySelector<HTMLElement>('.test-sidebar a')!.focus();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await stable();

    expect(host.sidebar.expandedState()).toBe(false);
    expect(menu.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(menu);
  });

  it('leaves the sidebar alone on Escape on wide screens', async () => {
    const { host, stable } = await render(1280);

    expect(host.sidebar.expandedState()).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await stable();

    expect(host.sidebar.expandedState()).toBe(true);
  });

  it('closes the overlay from the backdrop', async () => {
    const { element, host, stable } = await render(600);

    element.querySelector<HTMLButtonElement>('button.ng-doc-menu')!.click();
    await stable();
    element.querySelector<HTMLElement>('.ng-doc-backdrop')!.click();
    await stable();

    expect(host.sidebar.expandedState()).toBe(false);
  });

  it('exposes the sidenav through the root component', async () => {
    const fixture = TestBed.createComponent(NgDocRootComponent);

    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance.sidenav).toBeInstanceOf(NgDocSidenavComponent);
  });
});

describeChangeDetection('NgDocSidebarService', ({ mode, providers }) => {
  const initialWidth = window.innerWidth;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...providers, provideRouter([])] });
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: initialWidth });
  });

  it('shows the sidebar on wide screens and keeps the signal and the Observable in step', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    const service = TestBed.inject(NgDocSidebarService);
    const values: boolean[] = [];

    service.isExpanded().subscribe((value) => values.push(value));

    expect(service.expandedState()).toBe(true);
    expect(service.isMobile).toBe(false);

    setViewportWidth(900);

    expect(service.isMobile).toBe(true);
    expect(service.expandedState()).toBe(false);

    service.toggle();
    expect(service.expandedState()).toBe(true);

    setViewportWidth(901);

    expect(service.expandedState()).toBe(true);
    expect(values).toEqual([true, false, true]);
  });

  it('reports a resize that opens or closes the sidebar inside the Angular zone', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    const service = TestBed.inject(NgDocSidebarService);
    const zones: boolean[] = [];

    service.isExpanded().subscribe(() => zones.push(NgZone.isInAngularZone()));
    TestBed.inject(NgZone).runOutsideAngular(() => setViewportWidth(600));

    expect(service.expandedState()).toBe(false);
    // The first value is the one replayed on subscribe; the second comes from the resize.
    expect(zones).toHaveLength(2);
    expect(zones[1]).toBe(mode === 'zone');
  });

  it('closes the overlay after a navigation', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 600 });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [...providers, provideRouter([{ path: 'next', children: [] }])],
    });
    const service = TestBed.inject(NgDocSidebarService);

    service.show();
    expect(service.expandedState()).toBe(true);

    await TestBed.inject(Router).navigateByUrl('/next');

    expect(service.expandedState()).toBe(false);
  });
});

describeChangeDetection('NgDocThemeToggleComponent', ({ providers }) => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
    TestBed.configureTestingModule({
      providers: [...providers, { provide: WA_LOCAL_STORAGE, useValue: new MemoryStorage() }],
    });
  });

  afterEach(() => document.documentElement.removeAttribute('data-theme'));

  it('cycles Light, Dark and Auto and names the current theme', async () => {
    const fixture = TestBed.createComponent(NgDocThemeToggleComponent);
    const button = (): HTMLButtonElement => fixture.nativeElement.querySelector('button');
    const press = async (): Promise<void> => {
      button().click();
      fixture.detectChanges();
      await fixture.whenStable();
    };

    fixture.detectChanges();
    await fixture.whenStable();

    expect(button().getAttribute('aria-label')).toBe('Light theme. Switch to dark');

    await press();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(button().getAttribute('aria-label')).toBe('Dark theme. Switch to auto');

    await press();
    expect(document.documentElement.getAttribute('data-theme')).toBe('auto');
    expect(button().getAttribute('aria-label')).toBe('Auto theme. Switch to light');

    await press();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('follows a theme set through the theme service', async () => {
    const fixture = TestBed.createComponent(NgDocThemeToggleComponent);

    fixture.detectChanges();
    await fixture.whenStable();

    TestBed.inject(NgDocThemeService).set('dark');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('button').getAttribute('aria-label')).toBe(
      'Dark theme. Switch to auto',
    );
  });
});
