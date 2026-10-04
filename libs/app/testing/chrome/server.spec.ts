import { provideHttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  provideZonelessChangeDetection,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NgDocNavbarComponent } from '@ng-doc/app/components/navbar';
import { NgDocRootComponent } from '@ng-doc/app/components/root';
import { NgDocThemeToggleComponent } from '@ng-doc/app/components/theme-toggle';
import { NgDocTocComponent } from '@ng-doc/app/components/toc';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

@Component({
  selector: 'ng-doc-server-host',
  imports: [NgDocRootComponent, NgDocNavbarComponent, NgDocThemeToggleComponent, NgDocTocComponent],
  template: `
    <ng-doc-root>
      <ng-doc-navbar [search]="false">
        <a ngDocNavbarLeft href="/">Brand</a>
        <ng-doc-theme-toggle ngDocNavbarRight />
      </ng-doc-navbar>
      <nav class="test-sidebar" ngDocCustomSidebar><a href="/docs/a">Page A</a></nav>
      <ng-doc-toc />
    </ng-doc-root>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ServerHostComponent {}

/**
 * Renders the chrome as the server does: `ngServerMode` switches the render hooks off (as in a
 * server bundle), and the platform id is the server's. The full platform-server renderer cannot
 * run under jsdom, which already owns the DOM globals it replaces.
 * @returns The rendered host element.
 */
async function renderOnServer(): Promise<HTMLElement> {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      provideHttpClient(),
      { provide: PLATFORM_ID, useValue: 'server' },
    ],
  });
  const fixture = TestBed.createComponent(ServerHostComponent);

  fixture.detectChanges();
  await fixture.whenStable();

  return fixture.nativeElement;
}

describe('NgDoc chrome on the server', () => {
  let page: HTMLElement;
  const globals = globalThis as { ngServerMode?: boolean };
  const serverMode = globals.ngServerMode;

  beforeEach(async () => {
    // A wide window: without the server guard the service would open the sidebar, and a
    // narrow screen would then show the overlay open.
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    globals.ngServerMode = true;
    page = await renderOnServer();
  });

  afterEach(() => {
    globals.ngServerMode = serverMode;
  });

  it('renders the sidebar overlay closed, so narrow screens show the page until bootstrap', () => {
    const menu = page.querySelector('button.ng-doc-menu');
    const sidenav = page.querySelector('ng-doc-sidenav');

    expect(menu?.getAttribute('aria-expanded')).toBe('false');
    expect(menu?.getAttribute('aria-label')).toBe('Open navigation');
    expect(sidenav?.getAttribute('data-ng-doc-opened')).toBe('false');
    expect(page.querySelector('.ng-doc-backdrop')).toBeNull();
  });

  it('renders the skip link, the page target and the rail actions', () => {
    expect(page.querySelector('a.ng-doc-skip-link')?.getAttribute('href')).toBe('#ng-doc-content');
    expect(page.querySelector('#ng-doc-content')?.getAttribute('tabindex')).toBe('-1');
    expect(page.querySelector('ng-doc-toc')?.textContent).toContain('Back to top');
  });

  it('renders the theme toggle for the light theme', () => {
    expect(page.querySelector('ng-doc-theme-toggle button')?.getAttribute('aria-label')).toBe(
      'Light theme. Switch to dark',
    );
  });
});
