import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import {
	Directive,
	EmbeddedViewRef,
	Input,
	OnInit,
	TemplateRef,
	ViewContainerRef,
} from '@angular/core';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { distinctUntilChanged, pluck } from 'rxjs/operators';

@Directive({
	selector: '[ngDocMediaQuery]',
	exportAs: 'ngDocMediaQuery',
	standalone: true,
})
@UntilDestroy()
export class NgDocMediaQueryDirective implements OnInit {
	@Input('ngDocMediaQuery')
	match: string | string[] = [];

	readonly breakpoints: typeof Breakpoints = Breakpoints;

	private viewRef?: EmbeddedViewRef<unknown>;

	constructor(
		private readonly templateRef: TemplateRef<unknown>,
		private readonly viewContainerRef: ViewContainerRef,
		private readonly breakpointObserver: BreakpointObserver,
	) {}

	ngOnInit(): void {
		this.breakpointObserver
			.observe(this.match)
			.pipe(pluck('matches'), distinctUntilChanged(), untilDestroyed(this))
			.subscribe((matches: boolean) => {
				this.viewRef?.destroy();
				this.viewRef = undefined;

				if (matches) {
					this.viewRef = this.viewContainerRef.createEmbeddedView(this.templateRef);
					this.viewRef.markForCheck();
				}
			});
	}
}
