import {
	HttpEvent,
	HttpHandler,
	HttpInterceptor,
	HttpRequest,
	HttpResponse,
} from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { shareReplay, tap } from 'rxjs/operators';

@Injectable()
export class NgDocCacheInterceptor implements HttpInterceptor {
	static readonly TOKEN: string = Math.random().toString(36).slice(-8);
	private cache: Map<string, Observable<HttpEvent<unknown>>> = new Map<
		string,
		Observable<HttpEvent<unknown>>
	>();

	intercept<T>(request: HttpRequest<T>, next: HttpHandler): Observable<HttpEvent<T>> {
		// Only GET requests can be cached
		if (request.method !== 'GET') {
			return next.handle(request);
		}

		// Do not cache request when the token is not provided
		if (!request.params.has(NgDocCacheInterceptor.TOKEN)) {
			return next.handle(request);
		}

		// Return cached response
		const cachedRequest: Observable<HttpEvent<T>> | undefined = this.cache.get(
			request.url,
		) as Observable<HttpEvent<T>>;

		if (cachedRequest) {
			return cachedRequest;
		}

		// Clone the request, delete the TOKEN from the params
		const newRequest: HttpRequest<T> = request.clone({
			params: request.params.delete(NgDocCacheInterceptor.TOKEN),
		});

		// Create a new request handler
		const newHandler: Observable<HttpEvent<T>> = next.handle(newRequest).pipe(
			tap({
				error: (event: HttpEvent<Error>) => {
					if (event instanceof HttpResponse) {
						this.cache.delete(event.url || '');
					}
				},
			}),
			shareReplay(1),
		);

		// Cache the request and return the new handler
		this.cache.set(request.url, newHandler);

		return newHandler;
	}
}
