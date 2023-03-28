import {Provider} from '@angular/core';
import {SearchSchema} from '@ng-doc/app/interfaces';
import {NgDocPageSectionIndex} from '@ng-doc/core/interfaces';
import {create, insert, Orama} from '@orama/orama';
import {stemmers} from '@orama/orama';
import {
	afterInsert,
	OramaWithHighlight,
	SearchResultWithHighlight,
	searchWithHighlight,
} from '@orama/plugin-match-highlight';
import {from, Observable} from 'rxjs';
import {map, shareReplay, switchMap} from 'rxjs/operators';

/**
 * Possible languages for the `NgDocSearchEngine`.
 */
export type NgDocSearchEngineLanguage = keyof typeof stemmers;

/**
 * Provides the `NgDocSearchEngine` to enable search in the documentation.
 *
 * You can create and provide your own `NgDocSearchEngine` if you want to handle the search yourself.
 *
 * @param language
 */
export function provideSearchEngine(language?: NgDocSearchEngineLanguage): Provider {
	return {
		provide: NgDocSearchEngine,
		useValue: new NgDocSearchEngine(language),
	};
}

/**
 * Search engine for the documentation, it loads the index and provides a search method.
 */
export class NgDocSearchEngine {
	private db$: Observable<OramaWithHighlight>;

	constructor(language?: NgDocSearchEngineLanguage) {
		this.db$ = from(
			create({
				schema: {
					sectionTitle: 'string',
					content: 'string',
				},
				components: {
					afterInsert: [afterInsert],
					tokenizer: {
						language: language,
						stemmer: stemmers[language ?? 'english'],
					},
				},
			}),
		).pipe(
			map((db: Orama) => db as OramaWithHighlight),
			switchMap((db: OramaWithHighlight) =>
				this.request<NgDocPageSectionIndex[]>(`assets/ng-doc/indexes.json`).pipe(
					switchMap((pages: NgDocPageSectionIndex[]) =>
						Promise.all(
							pages.map((page: NgDocPageSectionIndex) => insert(db, page as unknown as SearchSchema)),
						),
					),
					map(() => db),
				),
			),
			shareReplay(1),
		) as Observable<OramaWithHighlight>;
	}

	/**
	 * Search the documentation for the given query.
	 *
	 * @param query The query to search for.
	 */
	search(query: string): Observable<SearchResultWithHighlight> {
		return this.db$.pipe(
			switchMap((db: OramaWithHighlight) =>
				searchWithHighlight(db, {
					term: query,
					boost: {sectionTitle: 2},
					properties: ['sectionTitle', 'content'],
				}),
			),
		);
	}

	private request<T>(url: string): Observable<T> {
		return from(fetch(url)).pipe(switchMap((response: Response) => from(response.json()) as Observable<T>));
	}
}
