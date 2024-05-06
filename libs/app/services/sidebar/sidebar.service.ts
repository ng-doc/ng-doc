import { Breakpoints } from '@angular/cdk/layout';
import { DOCUMENT } from '@angular/common';
import { Inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { NgDocScrollService } from '@ng-doc/ui-kit/services/scroll';
import { UntilDestroy } from '@ngneat/until-destroy';
import { BehaviorSubject, Observable } from 'rxjs';

/**
 * Service for sidebar, it can be used to hide/show sidebar or to check if sidebar is collapsable.
 */
@Injectable({
  providedIn: 'root',
})
@UntilDestroy()
export class NgDocSidebarService {
  readonly breakpoints: string[] = [Breakpoints.XSmall, Breakpoints.Small];
  protected readonly expanded: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(true);

  constructor(
    @Inject(DOCUMENT)
    protected readonly document: Document,
    protected readonly router: Router,
    protected readonly scroll: NgDocScrollService,
  ) {}

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
      this.scroll.block();
    }
  }

  /**
   * Hide sidebar, and unblock scrolling.
   */
  hide(): void {
    if (this.expanded.value) {
      this.expanded.next(false);
      this.scroll.unblock();
    }
  }

  /**
   * Toggle sidebar visibility.
   */
  toggle(): void {
    this.expanded.value ? this.hide() : this.show();
  }
}
