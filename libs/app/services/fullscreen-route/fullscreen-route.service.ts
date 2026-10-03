import { isPlatformBrowser } from '@angular/common';
import { computed, DOCUMENT, inject, PLATFORM_ID, Service, Signal, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  Event,
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationSkipped,
  Router,
} from '@angular/router';
import { filter, take } from 'rxjs/operators';

/** The host attribute with which `ng-doc-root` tells that a fullscreen route is shown. */
const ROOT_ATTRIBUTE = 'data-ng-doc-fullscreen-route';

/**
 * Tells whether a page shows one of its fullscreen routes: a child route of the page (see
 * `route.children` of `NgDocPage`), which `ng-doc-page` shows on its own, on the canvas of demos,
 * instead of the page. Pages with `disableFullscreenRoutes` never report one.
 *
 * While one is shown, `ng-doc-root` hides the navbar, the sidebar and the footer, and
 * `ng-doc-page-wrapper` hides the breadcrumbs, the page header, the page links and the table of
 * contents, so the route opens as a standalone page without changes to the application's template.
 */
@Service()
export class NgDocFullscreenRouteService {
  private readonly pages = signal<ReadonlySet<object>>(new Set());
  /**
   * Whether the server rendered a fullscreen route, until the first navigation in the browser
   * settles. `ng-doc-root` renders before its page does, and it must render the server's markup
   * (and hide the same chrome) until the page tells again.
   */
  private readonly serverRendered = signal<boolean>(false);

  /** Whether a page shows one of its fullscreen routes. */
  readonly active: Signal<boolean> = computed(() => this.serverRendered() || this.pages().size > 0);

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;

    this.serverRendered.set(
      !!inject(DOCUMENT).querySelector(`ng-doc-root[${ROOT_ATTRIBUTE}="true"]`),
    );
    inject(Router)
      .events.pipe(
        filter(
          (event: Event) =>
            event instanceof NavigationEnd ||
            event instanceof NavigationCancel ||
            event instanceof NavigationError ||
            event instanceof NavigationSkipped,
        ),
        take(1),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.serverRendered.set(false));
  }

  /**
   * Records whether a page shows one of its fullscreen routes.
   * @param page - The page.
   * @param shown - Whether the page shows a fullscreen route.
   * @internal
   */
  set(page: object, shown: boolean): void {
    const pages: ReadonlySet<object> = this.pages();

    if (pages.has(page) === shown) return;

    const next = new Set(pages);

    if (shown) {
      next.add(page);
    } else {
      next.delete(page);
    }
    this.pages.set(next);
  }
}
