import {BreakpointObserver, Breakpoints} from '@angular/cdk/layout';
import {DOCUMENT} from '@angular/common';
import {Inject, Injectable} from '@angular/core';
import {Event, NavigationEnd, Router} from '@angular/router';
import {NgDocScrollService} from '@ng-doc/ui-kit/services/scroll';
import {UntilDestroy, untilDestroyed} from '@ngneat/until-destroy';
import {BehaviorSubject, combineLatest, Observable, of} from 'rxjs';
import {debounceTime, distinctUntilChanged, filter, pluck, share, startWith, switchMap, tap} from 'rxjs/operators';

/**
 * Service for sidebar, it can be used to hide/show sidebar or to check if sidebar is collapsable.
 */
@Injectable({
	providedIn: 'root',
})
@UntilDestroy()
export class NgDocSidebarService {
	readonly breakpoints: string[] = [Breakpoints.XSmall, Breakpoints.Small];
	protected readonly observer: Observable<boolean>;
	protected readonly expanded: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(true);

	constructor(
		@Inject(DOCUMENT)
		protected readonly document: Document,
		protected readonly breakpointObserver: BreakpointObserver,
		protected readonly router: Router,
		protected readonly scroll: NgDocScrollService,
	) {
		this.observer = this.breakpointObserver.observe(this.breakpoints)
			.pipe(pluck('matches'), distinctUntilChanged(), untilDestroyed(this));

		combineLatest([this.router.events, this.isMobileMode()])
			.pipe(
				filter(([event, isMobileMode]: [Event, boolean]) => event instanceof NavigationEnd && this.expanded.value && isMobileMode),
				debounceTime(10),
			)
			.subscribe(() => this.hide());

		this.isMobileMode()
			.pipe(untilDestroyed(this))
			.subscribe((isMobileMode: boolean) => {
				if (isMobileMode) {
					this.hide()
				} else {
					this.show();
					this.scroll.unblock();
				}
			})
	}

	/**
	 * Indicates if sidebar is collapsable, based on the screen size.
	 */
	isMobileMode(): Observable<boolean> {
		return this.observer;
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
