// @vitest-environment node
import { ɵDomAdapter as DomAdapter, ɵgetDOM as getDOM } from '@angular/common';
import { HttpResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  destroyPlatform,
  Directive,
  inject,
  provideZoneChangeDetection,
  provideZonelessChangeDetection,
  Type,
  ViewContainerRef,
} from '@angular/core';
import { getTestBed } from '@angular/core/testing';
import { bootstrapApplication, BootstrapContext } from '@angular/platform-browser';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import {
  ɵDominoAdapter as DominoAdapter,
  provideServerRendering,
  renderApplication,
} from '@angular/platform-server';
import { NgDocIconComponent } from '@ng-doc/ui-kit/components/icon';
import { NG_DOC_ASSETS_PATH } from '@ng-doc/ui-kit/tokens';
import { of } from 'rxjs';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// This spec renders with the real server renderer, platform-server and its domino DOM, the way a
// server bundle does, because domino implements less of the DOM than a browser or jsdom.

const CHECK_SVG = '<svg id="check" viewBox="0 0 16 16"><path d="M1 8l4 4 9-9"></path></svg>';

@Component({
  selector: 'ng-doc-icon-server-host',
  imports: [NgDocIconComponent],
  template: `<ng-doc-icon icon="check" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class IconServerHostComponent {}

/** Creates an icon through its `ViewContainerRef`, as the page processor creates components. */
@Directive({ selector: '[ngDocIconSlot]' })
class IconSlotDirective {
  constructor() {
    inject(ViewContainerRef).createComponent(NgDocIconComponent).setInput('icon', 'check');
  }
}

/**
 * Angular 22.2 creates a component in the namespace of its container's parent node, and the
 * `@if` block keeps the SVG namespace of the `<svg>` before it, so the icon below is an SVG
 * element, as in the page component of the legacy engine.
 */
@Component({
  selector: 'ng-doc-icon-server-host',
  imports: [IconSlotDirective],
  template: `
    <button type="button">
      <svg width="16" height="16"><path d="M0 0" /></svg>
    </button>
    @if (true) {
      <div ngDocIconSlot></div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class IconInSvgNamespaceHostComponent {}

describe('NgDocIconComponent on the server', () => {
  const globals = globalThis as { ngServerMode?: boolean; Zone?: unknown };
  const serverMode = globals.ngServerMode;
  const adapter: DomAdapter = getDOM();
  const adapterPrototype: object | null = Object.getPrototypeOf(adapter);
  const supportsDOMEvents: boolean = adapter.supportsDOMEvents;

  beforeAll(() => {
    // Only one platform can exist, so the browser testing platform of the runner goes first.
    // Angular keeps the first DOM adapter it is given, which is the browser one the runner
    // installed, so that instance acts as the server adapter until the end of the spec.
    getTestBed().resetTestEnvironment();
    destroyPlatform();
    Object.setPrototypeOf(adapter, DominoAdapter.prototype);
    Object.assign(adapter, { supportsDOMEvents: false });
    // A server build defines `ngServerMode` as true.
    globals.ngServerMode = true;
  });

  afterAll(() => {
    globals.ngServerMode = serverMode;
    Object.setPrototypeOf(adapter, adapterPrototype);
    Object.assign(adapter, { supportsDOMEvents });
    destroyPlatform();
    getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  });

  afterEach(() => vi.restoreAllMocks());

  /**
   * Renders a host component to an HTML page on the server.
   * @param host - The root component.
   * @returns The page and the icon URLs it requested.
   */
  async function render(host: Type<unknown>): Promise<{ html: string; requests: string[] }> {
    const requests: string[] = [];
    const html: string = await renderApplication(
      (context: BootstrapContext): Promise<ApplicationRef> =>
        bootstrapApplication(
          host,
          {
            providers: [
              globals.Zone ? provideZoneChangeDetection() : provideZonelessChangeDetection(),
              provideServerRendering(),
              provideHttpClient(
                withInterceptors([
                  (request) => {
                    requests.push(request.url);

                    return of(
                      new HttpResponse({
                        body: CHECK_SVG,
                        headers: request.headers.set('content-type', 'image/svg+xml'),
                        url: request.url,
                      }),
                    );
                  },
                ]),
              ),
              { provide: NG_DOC_ASSETS_PATH, useValue: 'assets/ui-kit' },
            ],
          },
          context,
        ),
      {
        document:
          '<html><head><base href="/"></head><body><ng-doc-icon-server-host></ng-doc-icon-server-host></body></html>',
        url: '/',
      },
    );

    return { html, requests };
  }

  it('renders the SVG into the page', async () => {
    const error = vi.spyOn(console, 'error');
    const { html, requests } = await render(IconServerHostComponent);

    expect(error).not.toHaveBeenCalled();
    expect(requests).toEqual(['/assets/ui-kit/icons/16/check.svg#check']);
    expect(html).toMatch(/<ng-doc-icon [^>]*data-ng-doc-icon="check"[^>]*>/);
    expect(html).toContain(`data-ng-doc-size="16">${CHECK_SVG}</ng-doc-icon>`);
  });

  it('renders the SVG into the page when the icon is an SVG element', async () => {
    const error = vi.spyOn(console, 'error');
    const { html } = await render(IconInSvgNamespaceHostComponent);

    expect(error).not.toHaveBeenCalled();
    expect(html).toContain(`${CHECK_SVG}</ng-doc-icon>`);
  });
});
