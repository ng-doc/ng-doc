import type { LocationStrategy } from '@angular/common';

/**
 * Returns the current route as an absolute URL in path form: the route's path, query and fragment
 * on the document's origin.
 *
 * With `PathLocationStrategy`, the default, it is the document's own URL. With
 * `HashLocationStrategy` the route lives in the document's fragment (`/#/docs/page#section`), so
 * `location.hash` and links resolved against `location.href` see the wrong part of the URL. This
 * URL carries the route's own fragment, and relative links resolve against the route.
 * @param locationStrategy - The location strategy of the application.
 * @param documentUrl - The URL of the document, `location.href`.
 * @returns The URL of the route.
 * @internal
 */
export function ɵngDocRouteUrl(locationStrategy: LocationStrategy, documentUrl: string): URL {
  // A path that starts with `//` would be read as another host.
  return new URL(locationStrategy.path(true).replace(/^\/*/, '/'), documentUrl);
}

/**
 * Returns the absolute URL of the current page, without its query, as the reader shares it: the
 * route in the form the location strategy shows it (`/docs/page` or `/#/docs/page`).
 * @param locationStrategy - The location strategy of the application.
 * @param location - The location of the document.
 * @param fragment - The fragment to link to, without `#`.
 * @returns The URL of the page.
 * @internal
 */
export function ɵngDocPageUrl(
  locationStrategy: LocationStrategy,
  location: Pick<Location, 'href' | 'origin' | 'pathname'>,
  fragment?: string,
): string {
  const route = ɵngDocRouteUrl(locationStrategy, location.href);
  // `path()` includes the base href and `prepareExternalUrl()` adds it, so it is removed in
  // between; the round trip gives back the document's own path with `PathLocationStrategy`.
  const base = new URL(locationStrategy.getBaseHref() || '/', route).pathname.replace(/\/+$/, '');
  const path =
    base && (route.pathname === base || route.pathname.startsWith(`${base}/`))
      ? route.pathname.slice(base.length) || '/'
      : route.pathname;
  const external = locationStrategy.prepareExternalUrl(fragment ? `${path}#${fragment}` : path);

  if (external.startsWith('#')) {
    // The route is the document's fragment: it follows the document's path, without its query.
    return `${location.origin}${location.pathname}${external}`;
  }

  if (external.startsWith('/') && !external.startsWith('//')) {
    return `${location.origin}${external}`;
  }

  return new URL(external, location.href).href;
}
