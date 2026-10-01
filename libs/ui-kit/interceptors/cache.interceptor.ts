import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { shareReplay, tap } from 'rxjs/operators';

/**
 * Caches `GET` responses of requests that opt in with the `NgDocCacheInterceptor.TOKEN` query
 * parameter. The parameter is removed before the request is sent, and every later request for the
 * same URL shares the first response. A failed request is not cached.
 *
 * It only runs when the application's `HttpClient` uses interceptors from DI
 * (`withInterceptorsFromDi()`). NgDoc's icons no longer depend on it: they are cached by
 * `NgDocIconRegistry`.
 */
@Injectable()
export class NgDocCacheInterceptor implements HttpInterceptor {
  /** Name of the query parameter that marks a request as cacheable. */
  static readonly TOKEN: string = Math.random().toString(36).slice(-8);

  private readonly cache: Map<string, Observable<HttpEvent<unknown>>> = new Map();

  /**
   * Returns the cached response for opted-in `GET` requests and passes every other request on.
   * @param request - The outgoing request.
   * @param next - The next handler in the chain.
   * @returns The response stream.
   */
  intercept<T>(request: HttpRequest<T>, next: HttpHandler): Observable<HttpEvent<T>> {
    if (request.method !== 'GET' || !request.params.has(NgDocCacheInterceptor.TOKEN)) {
      return next.handle(request);
    }

    const cachedRequest = this.cache.get(request.url) as Observable<HttpEvent<T>> | undefined;

    if (cachedRequest) {
      return cachedRequest;
    }

    const newRequest: HttpRequest<T> = request.clone({
      params: request.params.delete(NgDocCacheInterceptor.TOKEN),
    });
    const newHandler: Observable<HttpEvent<T>> = next.handle(newRequest).pipe(
      // An error arrives as an `HttpErrorResponse`, so the entry is removed by the request URL:
      // the next request for it goes to the network again.
      tap({ error: () => this.cache.delete(request.url) }),
      shareReplay(1),
    );

    this.cache.set(request.url, newHandler);

    return newHandler;
  }
}
