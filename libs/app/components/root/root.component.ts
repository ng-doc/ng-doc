import { AsyncPipe, DOCUMENT, NgIf } from '@angular/common';
import {
	AfterViewInit,
	ChangeDetectionStrategy,
	Component,
	Directive,
	HostBinding,
	inject,
	Input,
	ViewChild,
} from '@angular/core';
import { Router, Scroll } from '@angular/router';
import { shakeElement } from '@ng-doc/app/helpers';
import { NgDocSidebarService } from '@ng-doc/app/services/sidebar';
import {
	NgDocContent,
	NgDocHorizontalAlign,
	NgDocLetDirective,
	NgDocSidenavComponent,
} from '@ng-doc/ui-kit';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { PolymorpheusModule } from '@tinkoff/ng-polymorpheus';
import { combineLatest, merge, NEVER, Observable, of } from 'rxjs';
import { delay, filter, map, mapTo, startWith } from 'rxjs/operators';

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
	standalone: true,
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
	standalone: true,
})
export class NgDocCustomSidebarDirective {}

@Component({
	selector: 'ng-doc-root',
	templateUrl: './root.component.html',
	styleUrls: ['./root.component.scss'],
	providers: [],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
	imports: [NgDocLetDirective, NgDocSidenavComponent, NgIf, PolymorpheusModule, AsyncPipe],
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

	protected readonly router: Router = inject(Router);
	protected readonly sidebarService: NgDocSidebarService = inject(NgDocSidebarService);
	protected readonly document: Document = inject(DOCUMENT);

	constructor() {
		this.router.events
			.pipe(
				filter((event) => event instanceof Scroll),
				map((event) => event as Scroll),
				delay(300),
				untilDestroyed(this),
			)
			.subscribe((event: Scroll) => {
				const elem = document.querySelector(`#${event.anchor}`);

				elem && shakeElement(elem);
			});
	}

	ngAfterViewInit(): void {
		this.sidenavState$ = combineLatest([
			this.sidebarService.isMobileMode(),
			this.sidenav
				? merge(
						this.sidenav.beforeOpen.pipe(mapTo(true)),
						this.sidenav.afterClose.pipe(mapTo(false)),
				  ).pipe(startWith(false))
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
