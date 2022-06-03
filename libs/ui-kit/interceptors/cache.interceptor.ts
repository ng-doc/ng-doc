import {HttpEvent, HttpHandler, HttpInterceptor, HttpRequest, HttpResponse} from '@angular/common/http';
import {Injectable} from '@angular/core';
import {Observable} from 'rxjs';
import {share, tap} from 'rxjs/operators';

@Injectable()
export class NgDocCacheInterceptor implements HttpInterceptor {
	static readonly TOKEN: string = Math.random().toString(36).slice(-8);

	private handlerPool: Map<string, Observable<HttpEvent<unknown>>> = new Map<string,
		Observable<HttpEvent<unknown>>>();

	intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
		if (request.params.has(NgDocCacheInterceptor.TOKEN)) {
			const cachedRequest: Observable<HttpEvent<unknown>> | undefined = this.handlerPool.get(request.url);

			if (cachedRequest) {
				return cachedRequest;
			}

			const newRequest: HttpRequest<unknown> = request.clone({
				params: request.params.delete(NgDocCacheInterceptor.TOKEN),
			});
			const newHandler: Observable<HttpEvent<unknown>> = next.handle(newRequest).pipe(
				tap((event: HttpEvent<unknown>) => {
					if (event instanceof HttpResponse) {
						this.handlerPool.delete(event.url || '');
					}
				}),
				share(),
			);
			this.handlerPool.set(request.url, newHandler);

			return newHandler;
		} else {
			return next.handle(request);
		}
	}
}
