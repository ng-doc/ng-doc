import {ChangeDetectionStrategy, ChangeDetectorRef, Component, HostBinding, Inject, Input, NgZone} from '@angular/core';
import {NgDocSidebarService} from '@ng-doc/app/services';
import {NgDocContent, ngDocZoneOptimize} from '@ng-doc/ui-kit';
import {WINDOW} from '@ng-web-apis/common';
import {UntilDestroy, untilDestroyed} from '@ngneat/until-destroy';
import {combineLatest, fromEvent} from 'rxjs';
import {distinctUntilChanged, map, startWith} from 'rxjs/operators';

/**
 * Navbar component for ng-doc application
 */
@Component({
	selector: 'ng-doc-navbar',
	templateUrl: './navbar.component.html',
	styleUrls: ['./navbar.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
@UntilDestroy()
export class NgDocNavbarComponent {
	/**
	 * Content for left side of navbar
	 */
	@Input()
	leftContent: NgDocContent = '';

	/**
	 * Content for center side of navbar
	 */
	@Input()
	centerContent: NgDocContent = '';

	/**
	 * Content for right side of navbar
	 */
	@Input()
	rightContent: NgDocContent = '';

	/**
	 * Show search input
	 */
	@Input()
	search: boolean = true;

	/**
	 * Use glass effect for navbar
	 */
	@Input()
	@HostBinding('attr.data-glass-effect')
	glassEffect: boolean = true;

	/**
	 * Indicates if navbar has shadow
	 */
	@HostBinding('class.has-shadow')
	hasShadow: boolean = false;

	constructor(
		@Inject(WINDOW)
		private readonly window: Window,
		private readonly ngZone: NgZone,
		private readonly changeDetectorRef: ChangeDetectorRef,
		protected readonly sidebarService: NgDocSidebarService,
	) {
		combineLatest([
			fromEvent(this.window, 'scroll').pipe(
				map((e: Event) => ((e.target as Document)?.scrollingElement?.scrollTop ?? 0) > 0),
				distinctUntilChanged(),
				startWith(false),
			),
			this.sidebarService.isExpanded(),
		])
			.pipe(
				map(([scrolled, sidebarVisible]: [boolean, boolean]) => scrolled || sidebarVisible),
				ngDocZoneOptimize(this.ngZone),
				untilDestroyed(this),
			)
			.subscribe((hasShadow: boolean) => {
				this.hasShadow = hasShadow;
				this.changeDetectorRef.markForCheck();
			});
	}
}
