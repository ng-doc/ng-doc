import {BreakpointObserver, Breakpoints} from '@angular/cdk/layout';
import {DOCUMENT} from '@angular/common';
import {Inject, Injectable} from '@angular/core';
import {Event, NavigationEnd, Router} from '@angular/router';
import {NgDocScrollService} from '@ng-doc/ui-kit';
import {UntilDestroy, untilDestroyed} from '@ngneat/until-destroy';
import {BehaviorSubject, Observable, of} from 'rxjs';
import {filter, pluck, startWith, switchMap} from 'rxjs/operators';

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
	protected readonly visible: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);

	constructor(
		@Inject(DOCUMENT)
		protected readonly document: Document,
		protected readonly breakpointObserver: BreakpointObserver,
		protected readonly router: Router,
		protected readonly scroll: NgDocScrollService,
	) {
		this.observer = this.breakpointObserver.observe(this.breakpoints).pipe(pluck('matches'), untilDestroyed(this));

		this.router.events
			.pipe(
				filter((event: Event) => event instanceof NavigationEnd && this.visible.value),
				startWith(null),
			)
			.subscribe(() => this.hide());
	}

	/**
	 * Indicates if sidebar can be collapsable.
	 * You can use it to start showing a button in the navbar to show/hide sidebar.
	 * This method uses media queries to check if sidebar is collapsable based on the current screen size.
	 */
	isCollapsable(): Observable<boolean> {
		return this.observer;
	}

	/**
	 * Indicates if sidebar is visible, based on the show/hide methods.
	 */
	visibilityChanges(): Observable<boolean> {
		return this.visible.asObservable();
	}

	/**
	 * Indicates if sidebar is expanded, based on the show/hide methods and if sidebar is collapsable.
	 * This method can be used to display backdrop when sidebar is expanded.
	 */
	isExpanded(): Observable<boolean> {
		return this.isCollapsable().pipe(
			switchMap((isCollapsable: boolean) => (isCollapsable ? this.visibilityChanges() : of(false))),
		);
	}

	/**
	 * Show sidebar, and block scrolling.
	 */
	show(): void {
		if (!this.visible.value) {
			this.visible.next(true);
			this.scroll.block();
		}
	}

	/**
	 * Hide sidebar, and unblock scrolling.
	 */
	hide(): void {
		if (this.visible.value) {
			this.visible.next(false);
			this.scroll.unblock();
		}
	}

	/**
	 * Toggle sidebar visibility.
	 */
	toggle(): void {
		this.visible.value ? this.hide() : this.show();
	}
}
