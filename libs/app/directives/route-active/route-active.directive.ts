import { computed, Directive, inject, input } from '@angular/core';
import { isActive, IsActiveMatchOptions, Router } from '@angular/router';
import { asArray } from '@ng-doc/core/helpers/as-array';

/**
 * Adds classes to its host element while the router URL matches a link.
 *
 * ```html
 * <a [ngDocRouteActive]="'/docs/getting-started'" activeClass="active">Getting started</a>
 * ```
 */
@Directive({
  selector: '[ngDocRouteActive]',
  host: {
    '[class]': 'classes()',
  },
})
export class NgDocRouteActiveDirective {
  /** The link to match against the router URL. */
  readonly link = input<string>('', { alias: 'ngDocRouteActive' });

  /** Class or classes to add while the link is active. */
  readonly activeClass = input<string | string[]>([]);

  /** How the link is matched against the router URL. */
  readonly matchOptions = input<IsActiveMatchOptions>({
    fragment: 'exact',
    paths: 'subset',
    queryParams: 'exact',
    matrixParams: 'exact',
  });

  private readonly router = inject(Router);

  // One router signal per link and options; it follows the URL the router has committed.
  private readonly active = computed(() => isActive(this.link(), this.router, this.matchOptions()));

  /** Whether the link is active. */
  readonly isActive = computed(() => this.active()());

  protected readonly classes = computed(() => (this.isActive() ? asArray(this.activeClass()) : []));
}
