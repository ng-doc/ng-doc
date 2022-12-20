import {isPresent, NgDocPageInfo, NgDocPageInfos} from '@ng-doc/core';
import * as lunr from 'lunr';
import {forkJoin, from, Observable} from 'rxjs';
import {map, shareReplay, switchMap} from 'rxjs/operators';

export class NgDocSearchEngine {
	private index$: Observable<[lunr.Index, NgDocPageInfos]>;

	constructor() {
		this.index$ = forkJoin([
			this.request<object>(`assets/ng-doc/indexes.json`).pipe(map(this.createIndex)),
			this.request<NgDocPageInfos>(`assets/ng-doc/pages.json`),
		]).pipe(shareReplay(1));
	}

	search(query: string): Observable<NgDocPageInfo[]> {
		return this.index$.pipe(
			map(([index, pages]: [lunr.Index, NgDocPageInfos]) => this.queryIndex(query, index, pages)),
		);
	}

	private createIndex(indexes: object): lunr.Index {
		const queryLexer: {termSeparator: RegExp} = (lunr as unknown as {QueryLexer: {termSeparator: RegExp}})
			.QueryLexer;

		queryLexer.termSeparator = lunr.tokenizer.separator = /\s+/;

		return lunr.Index.load(indexes);
	}

	private queryIndex(query: string, index: lunr.Index, dictionary: NgDocPageInfos): NgDocPageInfo[] {
		query = query.replace(/^["']|['"]$/g, '');

		try {
			if (query.length) {
				// First try a query where every term must be present
				// (see https://lunrjs.com/guides/searching.html#term-presence)
				const queryAll: string = query.replace(/\S+/g, '+$&');

				let results: lunr.Index.Result[] = index.search(queryAll);

				// If that was too restrictive just query for any term to be present
				if (results.length === 0) {
					results = index.search(query);
				}

				// If that is still too restrictive then search in the title for the first word in the query
				if (results.length === 0) {
					// E.g. if the search is "ngCont guide" then we search for "ngCont guide title:*ngCont*"
					const titleQuery: string = 'heading:*' + query.split(' ', 1)[0] + '*';
					results = index.search(query + ' ' + titleQuery);
				}

				// Map the hits into info about each page to be returned as results
				return results.map((hit: lunr.Index.Result) => dictionary[hit.ref]).filter(isPresent);
			}
		} catch (e) {
			// If the search query cannot be parsed the index throws an error
			// Log it and recover
			console.error(e);
		}
		return [];
	}

	private request<T>(url: string): Observable<T> {
		return from(fetch(url)).pipe(switchMap((response: Response) => from(response.json()) as Observable<T>));
	}
}
