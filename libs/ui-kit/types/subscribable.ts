import {Unsubscribable} from 'rxjs';

export interface NgDocSubscribable<T> {
	subscribe(next?: (value: T) => void, error?: (error: unknown) => void, complete?: () => void): Unsubscribable;
}
