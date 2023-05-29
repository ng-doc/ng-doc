import {
	AfterViewInit,
	ChangeDetectionStrategy,
	Component,
	Directive,
	HostBinding,
	Input,
	ViewChild,
} from '@angular/core';
import {NgDocSidebarService} from '@ng-doc/app/services/sidebar';
import {NgDocContent, NgDocHorizontalAlign, NgDocSidenavComponent} from '@ng-doc/ui-kit';
import {UntilDestroy} from '@ngneat/until-destroy';
import {combineLatest, merge, NEVER, Observable, of} from 'rxjs';
import {delay, filter, map, mapTo, startWith} from 'rxjs/operators';

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
export class NgDocRootComponent implements AfterViewInit {
	/**
	 * If `true` then the sidebar will be shown
	 * You can use it for example for landing page to hide sidebar
	 */
	@Input()
	sidebar: boolean = true;

	/**
	 * Content for footer
	 */
	@Input()
	footerContent: NgDocContent = '';

	/**
	 * If `true` then page will be shown without width limit.
	 * You can use it for example for landing page
	 */
	@Input()
	@HostBinding('attr.data-ng-doc-no-width-limit')
	noWidthLimit: boolean = false;

	@ViewChild(NgDocSidenavComponent)
	sidenav?: NgDocSidenavComponent;

	protected sidenavState$: Observable<{
		over: boolean;
		align: NgDocHorizontalAlign;
		hasBackdrop: boolean;
	}> = NEVER;

	constructor(protected readonly sidebarService: NgDocSidebarService) {}

	ngAfterViewInit(): void {
		this.sidenavState$ = combineLatest([
			this.sidebarService.isMobileMode(),
			this.sidenav
				? merge(this.sidenav.beforeOpen.pipe(mapTo(true)), this.sidenav.afterClose.pipe(mapTo(false))).pipe(
						startWith(false),
				  )
				: of(true),
		]).pipe(
			filter(([isMobile, opened]: [boolean, boolean]) => !opened || (opened && !isMobile)),
			map(([isMobile]: [boolean, boolean]) => ({
				over: isMobile,
				align: (isMobile ? 'right' : 'left') as NgDocHorizontalAlign,
				hasBackdrop: isMobile,
			})),
			delay(0),
		);
	}
}
