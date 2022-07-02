import {NgDocSubscribable} from '@ng-doc/ui-kit/types';
import {Observable, Subscriber, Unsubscribable} from 'rxjs';

/**
 * @param subscribable
 */
export function fromSubscribe<T>(subscribable: NgDocSubscribable<T>): Observable<T> {
	return new Observable<T>((observer: Subscriber<T>) => {
		const subscription: Unsubscribable = subscribable.subscribe(
			(next: T) => observer.next(next),
			(error: unknown) => observer.error(error),
			() => observer.complete(),
		);
		return () => subscription.unsubscribe();
	});
}
