import { Directive, ElementRef, Input, Renderer2 } from '@angular/core';
import { Event, IsActiveMatchOptions, NavigationEnd, Router } from '@angular/router';
import { asArray } from '@ng-doc/core/helpers/as-array';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { distinctUntilChanged, filter, map } from 'rxjs/operators';

@Directive({
	selector: '[ngDocRouteActive]',
	standalone: true,
})
@UntilDestroy()
export class NgDocRouteActiveDirective {
	@Input('ngDocRouteActive')
	link: string = '';

	@Input()
	activeClass: string | string[] = [];

	@Input()
	matchOptions: IsActiveMatchOptions = {
		fragment: 'exact',
		paths: 'subset',
		queryParams: 'exact',
		matrixParams: 'exact',
	};

	constructor(
		private readonly elementRef: ElementRef<HTMLElement>,
		private readonly router: Router,
		private readonly renderer: Renderer2,
	) {
		this.router.events
			.pipe(
				filter((event: Event) => event instanceof NavigationEnd),
				map(() => this.router.isActive(this.link, this.matchOptions)),
				distinctUntilChanged(),
				untilDestroyed(this),
			)
			.subscribe((isActive: boolean) => {
				isActive
					? asArray(this.activeClass).forEach((cls: string) =>
							this.renderer.addClass(this.elementRef.nativeElement, cls),
					  )
					: asArray(this.activeClass).forEach((cls: string) =>
							this.renderer.removeClass(this.elementRef.nativeElement, cls),
					  );
			});
	}
}
