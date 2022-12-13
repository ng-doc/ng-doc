import {BreakpointObserver} from '@angular/cdk/layout';
import {Location} from '@angular/common';
import {ChangeDetectionStrategy, Component, ElementRef, Inject, NgZone} from '@angular/core';
import {Router} from '@angular/router';
import {isExternalLink} from '@ng-doc/app/helpers/is-external-link';
import {NgDocSidebarService} from '@ng-doc/app/services';
import {fadeAnimation, ngDocZoneOptimize} from '@ng-doc/ui-kit';
import {WINDOW} from '@ng-web-apis/common';
import {UntilDestroy, untilDestroyed} from '@ngneat/until-destroy';
import {fromEvent, Observable} from 'rxjs';
import {filter} from 'rxjs/operators';

@Component({
	animations: [fadeAnimation],
	selector: 'ng-doc-root',
	templateUrl: './root.component.html',
	styleUrls: ['./root.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
@UntilDestroy()
export class NgDocRootComponent {
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
		(
			fromEvent(this.elementRef.nativeElement, 'click').pipe(
				untilDestroyed(this),
				ngDocZoneOptimize(this.ngZone),
				filter((event: Event) => event instanceof PointerEvent),
			) as Observable<PointerEvent>
		).subscribe((event: PointerEvent) => {
			const target: EventTarget | null = event.target;

			if (target instanceof HTMLAnchorElement) {
				if (isExternalLink(target.href)) {
					event.preventDefault();

					this.window.open(target.href, '_blank')?.focus();
				} else {
					const hasModifier: boolean = event.button !== 0 || event.ctrlKey || event.metaKey;
					const isDownloadable: boolean = target.getAttribute('download') != null;
					const hasHash: boolean = !!target.hash;

					if (!hasModifier && !isDownloadable && !hasHash) {
						const {pathname, search} = target;
						const isInPageAnchor: boolean = target.getAttribute('href')?.startsWith('#') ?? false;
						const correctPathname: string = isInPageAnchor ? this.location.path() : pathname;
						const relativeUrl: string = correctPathname + search;

						event.preventDefault();

						this.router.navigate([relativeUrl]);
					}
				}
			}
		});
	}
}
