import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { ngDocZoneOptimize } from '@ng-doc/ui-kit';
import { NgDocScrollService } from '@ng-doc/ui-kit/services/scroll';
import { WINDOW } from '@ng-web-apis/common';
import { BehaviorSubject, fromEvent, Observable, share } from 'rxjs';
import { filter, startWith } from 'rxjs/operators';

/**
 * Service for sidebar, it can be used to hide/show sidebar or to check if sidebar is collapsable.
 */
@Injectable({
  providedIn: 'root',
})
export class NgDocSidebarService {
  protected readonly expanded = new BehaviorSubject<boolean>(false);
  protected readonly document = inject(DOCUMENT);
  protected readonly window = inject(WINDOW);
  protected readonly router = inject(Router);
  protected readonly scroll = inject(NgDocScrollService);

  constructor() {
    const windowResize = fromEvent(this.window, 'resize').pipe(
      takeUntilDestroyed(),
      startWith(null),
      share(),
    );

    windowResize
      .pipe(
        filter(() => this.expanded.value && this.isMobile),
        ngDocZoneOptimize(),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.hide());

    windowResize
      .pipe(
        filter(() => !this.expanded.value && !this.isMobile),
        ngDocZoneOptimize(),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.show());

    windowResize
      .pipe(
        filter(() => this.expanded.value && !this.isMobile),
        ngDocZoneOptimize(),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.scroll.unblock());

    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd && this.expanded.value && this.isMobile),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.hide());
  }

  get isMobile(): boolean {
    return this.window.innerWidth < 1024;
  }

  /**
   * Indicates if sidebar is visible, based on the show/hide methods.
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
}
