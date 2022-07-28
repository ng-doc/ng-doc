import * as lunr from 'lunr';
import {Observable, Subscriber} from 'rxjs';
import {map, shareReplay} from 'rxjs/operators';

export class NgDocSearchEngine {
	private index$: Observable<lunr.Index>;

	constructor() {
		this.index$ = this.request(`assets/ng-doc/indexes.json`).pipe(
			map((indexes: object) => lunr.Index.load(indexes)),
			shareReplay(1),
		);
	}

	search(term: string): Observable<lunr.Index.Result[]> {
		return this.index$.pipe(map((index: lunr.Index) => index.search(term)));
	}

	private request(url: string): Observable<object> {
		return new Observable<object>((subscriber: Subscriber<object>) => {
			const request: XMLHttpRequest = new XMLHttpRequest();

			request.onload = function () {
				subscriber.next(JSON.parse(this.responseText));
			};
			request.onerror = function () {
				subscriber.error(this.response);
			};

			request.open('GET', url);
			request.send();
		});
	}
}
