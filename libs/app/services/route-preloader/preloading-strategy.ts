import { inject, Service } from '@angular/core';
import { PreloadingStrategy, Route } from '@angular/router';
import { catchError, Observable, of } from 'rxjs';

import { NgDocRoutePreloader } from './route-preloader.service';

/**
 * The router preloading strategy of NgDoc: it loads a lazy route only when the reader is about
 * to open one of its pages, as `NgDocRoutePreloader` decides, instead of every route at once.
 *
 * Set it as the router's preloading strategy to preload pages on intent:
 *
 * ```ts
 * provideRouter(routes, withPreloading(NgDocPreloadingStrategy));
 * ```
 */
@Service()
export class NgDocPreloadingStrategy implements PreloadingStrategy {
  private readonly preloader = inject(NgDocRoutePreloader);

  constructor() {
    // The router creates its preloading strategy at start-up, so this is where preloading on
    // intent starts.
    this.preloader.enable();
  }

  /**
   * Loads a lazy route when it leads to a page that is being preloaded.
   * @param route - A lazy route that the router has not loaded yet.
   * @param load - Loads the route.
   * @returns The load, or an observable of `null` when the route is not loaded now.
   */
  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    if (!this.preloader.shouldPreload(route)) return of(null);

    // A failed preload is not an error: opening the page loads the route again and reports it.
    return load().pipe(catchError(() => of(null)));
  }
}
