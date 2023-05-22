import {BreakpointObserver, Breakpoints} from '@angular/cdk/layout';
import {Directive, EmbeddedViewRef, Input, OnChanges, TemplateRef, ViewContainerRef} from '@angular/core';
import {UntilDestroy, untilDestroyed} from '@ngneat/until-destroy';
import {Subject} from 'rxjs';
import {distinctUntilChanged, pluck, takeUntil} from 'rxjs/operators';

@Directive({
	selector: '[ngDocMediaQuery]',
	exportAs: 'ngDocMediaQuery',
})
@UntilDestroy()
export class NgDocMediaQueryDirective implements OnChanges {
	@Input('ngDocMediaQuery')
	match: string | string[] = [];

	readonly breakpoints: typeof Breakpoints = Breakpoints;

	private readonly unsubscribe$: Subject<void> = new Subject<void>();
	private viewRef?: EmbeddedViewRef<unknown>;

	constructor(
		private readonly templateRef: TemplateRef<unknown>,
		private readonly viewContainerRef: ViewContainerRef,
		private readonly breakpointObserver: BreakpointObserver,
	) {}

	ngOnChanges(): void {
		this.unsubscribe$.next();

		this.breakpointObserver
			.observe(this.match)
			.pipe(pluck('matches'), distinctUntilChanged(), takeUntil(this.unsubscribe$), untilDestroyed(this))
			.subscribe((matches: boolean) => {
				this.viewRef?.destroy();
				this.viewRef = undefined;

				if (matches) {
					this.viewRef = this.viewContainerRef.createEmbeddedView(this.templateRef);
					this.viewRef.detectChanges();
				}
			});
	}
}
