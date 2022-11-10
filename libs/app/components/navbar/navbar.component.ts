import {ChangeDetectionStrategy, ChangeDetectorRef, Component, HostBinding, Inject, Input, NgZone} from '@angular/core';
import {NgDocContent, ngDocZoneOptimize} from '@ng-doc/ui-kit';
import {WINDOW} from '@ng-web-apis/common';
import {UntilDestroy} from '@ngneat/until-destroy';
import {fromEvent} from 'rxjs';
import {debounceTime, distinctUntilChanged, map} from 'rxjs/operators';

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
	) {
		fromEvent(this.window, 'scroll')
			.pipe(
				debounceTime(10),
				map((e: Event) => ((e.target as Document)?.scrollingElement?.scrollTop ?? 0) > 0),
				distinctUntilChanged(),
				ngDocZoneOptimize(this.ngZone)
			)
			.subscribe((scrolled: boolean) => {
				this.hasShadow = scrolled;
				this.changeDetectorRef.markForCheck();
			});
	}
}
