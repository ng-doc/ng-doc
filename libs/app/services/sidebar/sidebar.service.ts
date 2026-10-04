import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, DOCUMENT, inject, NgZone, PLATFORM_ID, Service, Signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { NgDocScrollService } from '@ng-doc/ui-kit/services/scroll';
import { WA_WINDOW } from '@ng-web-apis/common';
import { BehaviorSubject, Observable } from 'rxjs';
import { filter } from 'rxjs/operators';

/**
 * The widest viewport, in CSS pixels, at which the sidebar is an overlay that the navbar's menu
 * button opens. It matches the `max-width: 900px` media query of `ng-doc-sidenav`.
 */
export const NG_DOC_SIDEBAR_COLLAPSE_WIDTH = 900;

/**
 * Service for sidebar, it can be used to hide/show sidebar or to check if sidebar is collapsable.
 *
 * On wide screens the sidebar is always shown. At `NG_DOC_SIDEBAR_COLLAPSE_WIDTH` and below it is
 * an overlay: `show()` opens it and blocks page scrolling, `hide()` closes it, and a navigation
 * or a resize to a wide screen ends the overlay.
 */
@Service()
export class NgDocSidebarService {
  protected readonly document = inject(DOCUMENT);
  protected readonly window = inject(WA_WINDOW);
  protected readonly router = inject(Router);
  protected readonly scroll = inject(NgDocScrollService);

  protected readonly expanded = new BehaviorSubject<boolean>(false);

  /**
   * Whether the sidebar is shown, as a signal. It follows the same state as `isExpanded()`.
   */
  readonly expandedState: Signal<boolean> = toSignal(this.expanded, { requireSync: true });

  private readonly ngZone = inject(NgZone);

  constructor() {
    // On the server the sidebar stays closed: the prerendered page must not show the overlay
    // open on narrow screens. The browser opens it on wide screens once the app starts.
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      this.syncWithViewport();

      const onResize = (): void => {
        // Only a change of the open state re-enters the Angular zone, so `isExpanded()`
        // subscribers run inside it; other resizes stay outside.
        if (this.isMobile === this.expanded.value) {
          this.ngZone.run(() => this.syncWithViewport());
        } else if (this.expanded.value) {
          this.scroll.unblock();
        }
      };

      this.ngZone.runOutsideAngular(() => this.window.addEventListener('resize', onResize));
      inject(DestroyRef).onDestroy(() => this.window.removeEventListener('resize', onResize));
    }

    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd && this.expanded.value && this.isMobile),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.hide());
  }

  /**
   * Whether the viewport is narrow enough for the sidebar to be an overlay.
   */
  get isMobile(): boolean {
    return this.window.innerWidth <= NG_DOC_SIDEBAR_COLLAPSE_WIDTH;
  }

  /**
   * Indicates if sidebar is visible, based on the show/hide methods.
   * Read `expandedState` for the same value as a signal.
   */
  isExpanded(): Observable<boolean> {
    return this.expanded.asObservable();
  }

  /**
   * Show sidebar, and block scrolling.
   */
  show(): void {
    if (!this.expanded.value) {
      this.expanded.next(true);
      this.isMobile && this.scroll.block();
    }
  }

  /**
   * Hide sidebar, and unblock scrolling.
   */
  hide(): void {
    if (this.expanded.value) {
      this.expanded.next(false);
      this.isMobile && this.scroll.unblock();
    }
  }

  /**
   * Toggle sidebar visibility.
   */
  toggle(): void {
    this.expanded.value ? this.hide() : this.show();
  }

  private syncWithViewport(): void {
    if (this.isMobile) {
      this.hide();
    } else if (this.expanded.value) {
      // The overlay may have blocked scrolling before the viewport grew.
      this.scroll.unblock();
    } else {
      this.show();
    }
  }
}
