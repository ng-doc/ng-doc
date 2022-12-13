import {ChangeDetectionStrategy, ChangeDetectorRef, Component, HostBinding, Inject, Input, NgZone} from '@angular/core';
import {NgDocSidebarService} from '@ng-doc/app/services';
import {NgDocContent, ngDocZoneOptimize} from '@ng-doc/ui-kit';
import {WINDOW} from '@ng-web-apis/common';
import {UntilDestroy, untilDestroyed} from '@ngneat/until-destroy';
import {combineLatest, fromEvent, merge, of} from 'rxjs';
import {debounceTime, distinctUntilChanged, map, startWith, switchMap} from 'rxjs/operators';

@Component({
	selector: 'ng-doc-navbar',
	templateUrl: './navbar.component.html',
	styleUrls: ['./navbar.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
@UntilDestroy()
export class NgDocNavbarComponent {
	@Input()
	leftContent: NgDocContent = '';

	@Input()
	centerContent: NgDocContent = '';

	@Input()
	rightContent: NgDocContent = '';

	@Input()
	search: boolean = true;

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
