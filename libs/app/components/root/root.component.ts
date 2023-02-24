import {BreakpointObserver} from '@angular/cdk/layout';
import {Location} from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	Directive,
	ElementRef,
	HostBinding,
	Inject,
	Input,
	NgZone,
} from '@angular/core';
import {Event as RouterEvent, NavigationEnd, Router} from '@angular/router';
import {isExternalLink} from '@ng-doc/app/helpers/is-external-link';
import {NgDocSidebarService} from '@ng-doc/app/services';
import {ngDocZoneDetach} from '@ng-doc/ui-kit';
import {WINDOW} from '@ng-web-apis/common';
import {UntilDestroy, untilDestroyed} from '@ngneat/until-destroy';
import {fromEvent, Observable} from 'rxjs';
import {delay, filter, take} from 'rxjs/operators';

/**
 * Directive uses for providing custom navbar, you should mark element with this directive
 * and the `NgDocRootComponent` will use it as a navbar
 *
 * ```html
 * <ng-doc-root>
 *     <my-custom-navbar ngDocCustomNavbar></my-custom-navbar>
 *
 *     <ng-doc-sidebar></ng-doc-sidebar>
 *     <router-outlet></router-outlet>
 * </ng-doc-root>
 * ```
 */
@Directive({
	selector: '[ngDocCustomNavbar]',
})
export class NgDocCustomNavbarDirective {}

/**
 * Directive uses for providing custom sidebar, you should mark element with this directive
 * and the `NgDocRootComponent` will use it as a sidebar
 *
 * ```html
 * <ng-doc-root>
 *     <ng-doc-navbar></ng-doc-sidebar>
 *
 *     <my-custom-sidebar ngDocCustomSidebar></my-custom-sidebar>
 *     <router-outlet></router-outlet>
 * </ng-doc-root>
 * ```
 */
@Directive({
	selector: '[ngDocCustomSidebar]',
})
export class NgDocCustomSidebarDirective {}

@Component({
	selector: 'ng-doc-root',
	templateUrl: './root.component.html',
	styleUrls: ['./root.component.scss'],
	providers: [],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
@UntilDestroy()
export class NgDocRootComponent {
	/**
	 * If `true` then the sidebar will be shown
	 */
	@Input()
	sidebar: boolean = true;

	/**
	 * If `true` then page will be shown without width limit.
	 * You can use it for example for landing page
	 */
	@Input()
	@HostBinding('attr.data-ng-doc-no-width-limit')
	noWidthLimit: boolean = false;

	@HostBinding('@.disabled')
	disabledAnimations: boolean = true;

	constructor(
		private readonly elementRef: ElementRef<HTMLElement>,
		private readonly ngZone: NgZone,
		private readonly router: Router,
		private readonly location: Location,
		private readonly breakpointObserver: BreakpointObserver,
		protected readonly sidebarService: NgDocSidebarService,
		@Inject(WINDOW)
		private readonly window: Window,
	) {
		// Trick for preventing initial animations
		this.router.events
			.pipe(
				filter((event: RouterEvent) => event instanceof NavigationEnd),
				take(1),
				delay(100),
			)
			.subscribe(() => (this.disabledAnimations = false));

		(
			fromEvent(this.elementRef.nativeElement, 'click').pipe(
				filter(this.isPointerEvent),
				untilDestroyed(this),
				ngDocZoneDetach(this.ngZone),
			) as Observable<PointerEvent>
		).subscribe((event: PointerEvent) => {
			if (event.target instanceof Node) {
				let target: Node | null = event.target;

				while (target && !(target instanceof HTMLAnchorElement)) {
					target = target.parentElement;
				}

				if (target instanceof HTMLAnchorElement) {
					if (isExternalLink(target.href)) {
						event.preventDefault();

						this.window.open(target.href, '_blank')?.focus();
					} else {
						const hasModifier: boolean = event.button !== 0 || event.ctrlKey || event.metaKey;
						const isDownloadable: boolean = target.getAttribute('download') != null;

						if (!hasModifier && !isDownloadable) {
							const {pathname, search} = target;
							const isInPageAnchor: boolean = target.getAttribute('href')?.startsWith('#') ?? false;
							const correctPathname: string = isInPageAnchor ? this.location.path() : pathname;
							const relativeUrl: string = correctPathname + search;
							const hash: string = target.hash;

							event.preventDefault();

							this.ngZone.run(() => {
								this.router.navigate([relativeUrl], {
									fragment: hash.replace(/^#/, '') || undefined,
								});
							});
						}
					}
				}
			}
		});
	}

	private isPointerEvent(event: Event): event is PointerEvent {
		return event instanceof PointerEvent;
	}
}
