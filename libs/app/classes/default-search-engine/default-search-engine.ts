import {NgDocSearchEngine} from '@ng-doc/app/classes/search-engine';
import {NgDocSearchResult} from '@ng-doc/app/interfaces';
import {asArray} from '@ng-doc/core/helpers/as-array';
import {objectKeys} from '@ng-doc/core/helpers/object-keys';
import {NgDocPageSectionIndex} from '@ng-doc/core/interfaces';
import {NgDocHighlightPosition} from '@ng-doc/ui-kit';
import {create, insert, Orama, stemmers} from '@orama/orama';
import {Document} from '@orama/orama/dist/types';
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
export type NgDocDefaultSearchEngineLanguage = keyof typeof stemmers;

interface SearchSchema extends Document {
	sectionTitle: 'string';
	content: 'string';
}


/**
 * Search engine for the documentation, it loads the index and provides a search method.
 */
export class NgDocDefaultSearchEngine extends NgDocSearchEngine {
	private db$: Observable<OramaWithHighlight>;

	constructor(language?: NgDocDefaultSearchEngineLanguage) {
		super();
		this.db$ = from(
			create({
				schema: {
					sectionTitle: 'string',
					content: 'string',
				},
				components: {
					afterInsert: [afterInsert],
					tokenizer: {
						language: language || 'english',
						stemmer: stemmers[language || 'english'],
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
	search(query: string): Observable<NgDocSearchResult[]> {
		return this.db$.pipe(
			switchMap((db: OramaWithHighlight) =>
				searchWithHighlight(db, {
					term: query,
					boost: {sectionTitle: 2},
					properties: ['sectionTitle', 'content'],
				}),
			),
			map((result: SearchResultWithHighlight) =>
				result.hits.map((hit: SearchResultWithHighlight['hits'][0]) => {
					const keys: Array<keyof NgDocPageSectionIndex> = objectKeys(hit.positions) as unknown as Array<keyof NgDocPageSectionIndex>;

					return {
						index: hit.document as unknown as NgDocPageSectionIndex,
						positions: keys.reduce((acc: Record<keyof NgDocPageSectionIndex, NgDocHighlightPosition[]>, key: keyof NgDocPageSectionIndex) => {
							// eslint-disable-next-line @typescript-eslint/ban-ts-comment
							// @ts-ignore
							acc[key] = [...asArray(acc[key]), ...Object.values(hit.positions[key]).flat()];

							return acc;
						}, {} as any) as Partial<Record<keyof NgDocPageSectionIndex, NgDocHighlightPosition[]>>,
					}
				})
			)
		);
	}

	private request<T>(url: string): Observable<T> {
		return from(fetch(url)).pipe(switchMap((response: Response) => from(response.json()) as Observable<T>));
	}
}
