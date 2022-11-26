import {Location} from '@angular/common';
import {ChangeDetectionStrategy, Component, ElementRef, NgZone} from '@angular/core';
import {Router} from '@angular/router';
import {ngDocZoneDetach, ngDocZoneOptimize} from '@ng-doc/ui-kit';
import {UntilDestroy, untilDestroyed} from '@ngneat/until-destroy';
import {fromEvent, Observable} from 'rxjs';
import {filter} from 'rxjs/operators';

@Component({
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
				const hasModifier: boolean = event.button !== 0 || event.ctrlKey || event.metaKey;
				const isDownloadable: boolean = target.getAttribute('download') != null;
				const hasHash: boolean = !!target.hash;


				if (!hasModifier && !isDownloadable && !hasHash) {
					const { pathname, search } = target;
					const isInPageAnchor: boolean = target.getAttribute('href')?.startsWith('#') ?? false;
					const correctPathname: string = isInPageAnchor ? this.location.path() : pathname;
					const relativeUrl: string = correctPathname + search;

					event.preventDefault();

					this.router.navigate([relativeUrl]);
				}
			}
		});
	}
}
