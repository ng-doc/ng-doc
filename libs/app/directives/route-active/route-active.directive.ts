import { Directive, ElementRef, inject, Input, Renderer2 } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Event, IsActiveMatchOptions, NavigationEnd, Router } from '@angular/router';
import { asArray } from '@ng-doc/core/helpers/as-array';
import { distinctUntilChanged, filter, map } from 'rxjs/operators';

@Directive({
  selector: '[ngDocRouteActive]',
  standalone: true,
})
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

  constructor() {
    const elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
    const router = inject(Router);
    const renderer = inject(Renderer2);

    router.events
      .pipe(
        filter((event: Event) => event instanceof NavigationEnd),
        map(() => router.isActive(this.link, this.matchOptions)),
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
      .subscribe((isActive: boolean) => {
        isActive
          ? asArray(this.activeClass).forEach((cls: string) =>
              renderer.addClass(elementRef.nativeElement, cls),
            )
          : asArray(this.activeClass).forEach((cls: string) =>
              renderer.removeClass(elementRef.nativeElement, cls),
            );
      });
  }
}
