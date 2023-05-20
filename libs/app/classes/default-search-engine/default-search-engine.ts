import {NgDocSearchEngine} from '@ng-doc/app/classes/search-engine';
import {NgDocSearchResult} from '@ng-doc/app/interfaces';
import {asArray} from '@ng-doc/core/helpers/as-array';
import {objectKeys} from '@ng-doc/core/helpers/object-keys';
import {NgDocPageIndex} from '@ng-doc/core/interfaces';
import {NgDocHighlightPosition} from '@ng-doc/ui-kit';
import {create, insertMultiple, Orama} from '@orama/orama';
import {Document} from '@orama/orama/dist/types';
import {
	afterInsert,
	OramaWithHighlight,
	SearchResultWithHighlight,
	searchWithHighlight,
} from '@orama/plugin-match-highlight';
import * as stemmer from '@orama/stemmers';
import {from, Observable} from 'rxjs';
import {map, shareReplay, switchMap} from 'rxjs/operators';

/**
 * Options for the `NgDocDefaultSearchEngine`.
 */
export interface NgDocDefaultSearchEngineOptions {
	/**
	 * The language to use for the search engine.
	 */
	stemmer?: typeof stemmer.stemmer;
	/**
	 * Specifies the maximum distance (following the Levenshtein algorithm) between the term and the searchable property.
	 * (doesn't work with `exact` option)
	 */
	tolerance?: number;
	/**
	 * If `true`, finds all the document with an exact match of the term property.
	 */
	exact?: boolean;
	/**
	 * Number of results to return (default: 10).
	 */
	limit?: number;
}

interface SearchSchema extends Document {
	title: 'string';
	sectionTitle: 'string';
	content: 'string';
}


/**
 * Search engine for the documentation, it loads the index and provides a search method.
 */
export class NgDocDefaultSearchEngine extends NgDocSearchEngine {
	private db$: Observable<OramaWithHighlight>;

	constructor(private options?: NgDocDefaultSearchEngineOptions) {
		super();
		this.db$ = from(
			create({
				schema: {
					title: 'string',
					section: 'string',
					content: 'string',
				},
				components: {
					afterInsert: [afterInsert],
					tokenizer: {
						stemmer: options?.stemmer
					},
				},
			}),
		).pipe(
			map((db: Orama) => db as OramaWithHighlight),
			switchMap((db: OramaWithHighlight) =>
				this.request<NgDocPageIndex[]>(`assets/ng-doc/indexes.json`).pipe(
					switchMap((pages: NgDocPageIndex[]) =>
						insertMultiple(db, pages as unknown as SearchSchema[]),
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
	search(query: string): Observable<NgDocSearchResult[]> {
		return this.db$.pipe(
			switchMap((db: OramaWithHighlight) =>
				searchWithHighlight(db, {
					term: query,
					boost: {title: 4, section: 2},
					properties: ['section', 'content'],
					tolerance: this.options?.tolerance,
					exact: this.options?.exact,
					limit: this.options?.limit ?? 10,
				}),
			),
			map((result: SearchResultWithHighlight) =>
				result.hits.map((hit: SearchResultWithHighlight['hits'][0]) => {
					const keys: Array<keyof NgDocPageIndex> = objectKeys(hit.positions) as unknown as Array<keyof NgDocPageIndex>;

					return {
						index: hit.document as unknown as NgDocPageIndex,
						positions: keys.reduce((acc: Record<keyof NgDocPageIndex, NgDocHighlightPosition[]>, key: keyof NgDocPageIndex) => {
							// eslint-disable-next-line @typescript-eslint/ban-ts-comment
							// @ts-ignore
							acc[key] = [...asArray(acc[key]), ...Object.values(hit.positions[key]).flat()];

							return acc;
						}, {} as any) as Partial<Record<keyof NgDocPageIndex, NgDocHighlightPosition[]>>,
					}
				})
			)
		);
	}

	private request<T>(url: string): Observable<T> {
		return from(fetch(url)).pipe(switchMap((response: Response) => response.json() as Promise<T>));
	}
}
