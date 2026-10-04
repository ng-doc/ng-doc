import { NgDocSearchEngine } from '@ng-doc/app/classes/search-engine';
import { NgDocSearchResult } from '@ng-doc/app/interfaces';
import { asArray } from '@ng-doc/core/helpers/as-array';
import { NgDocPageIndex } from '@ng-doc/core/interfaces';
import { NgDocHighlightPosition } from '@ng-doc/ui-kit';
import { create, insertMultiple, Orama } from '@orama/orama';
import {
  afterInsert,
  OramaWithHighlight,
  searchWithHighlight,
} from '@orama/plugin-match-highlight';
import { stemmer } from '@orama/stemmers/english';
import { defer, from, Observable } from 'rxjs';
import { map, shareReplay, switchMap } from 'rxjs/operators';

type OramaDb = OramaWithHighlight<
  Orama<{
    title: 'string';
    section: 'string';
    content: 'string';
    pageType: 'enum';
  }>
>;

/** The properties the engine searches in; the page type only filters the results. */
const SEARCHED_PROPERTIES = ['title', 'section', 'content'] as const;

/**
 * Options for the `NgDocDefaultSearchEngine`.
 */
export interface NgDocDefaultSearchEngineOptions {
  /**
   * The language to use for the search engine. See https://www.npmjs.com/package/@orama/stemmers for available languages
   */
  stemmer?: typeof stemmer;
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
   * Number of results to return (default: 10). Guides get up to half of them, and more when
   * fewer API references match; API references fill the rest.
   */
  limit?: number;
}

/**
 * Search engine for the documentation, it loads the index and provides a search method.
 *
 * Guides rank above API references: the results list the matching guides first, then the
 * matching API references, each in order of relevance. Guides take up to half of the `limit`
 * (rounded up), or more when fewer API references match; API references fill the rest, and take
 * more than half when fewer guides match.
 */
export class NgDocDefaultSearchEngine extends NgDocSearchEngine {
  private db$: Observable<OramaDb>;

  constructor(private options?: NgDocDefaultSearchEngineOptions) {
    super();

    this.db$ = this.request<NgDocPageIndex[]>(`assets/ng-doc/indexes.json`).pipe(
      switchMap((pages) => this.createDatabase(pages)),
      shareReplay(1),
    ) as Observable<OramaDb>;
  }

  /**
   * Search the documentation for the given query.
   * @param query The query to search for.
   */
  search(query: string): Observable<NgDocSearchResult[]> {
    return this.db$.pipe(
      switchMap((db) =>
        // Each type of page is searched on its own, so that API references, which usually have
        // many more records, cannot push the guides out of the limit.
        from(
          Promise.all([
            this.searchPages(db, query, { eq: 'guide' }),
            this.searchPages(db, query, { nin: ['guide'] }),
          ]),
        ),
      ),
      map(([guides, others]) =>
        share(guides.hits, others.hits, this.options?.limit ?? 10).map((hit) => {
          const keys = SEARCHED_PROPERTIES.filter((key) => hit.positions[key]);

          return {
            index: hit.document as unknown as NgDocPageIndex,
            positions: keys.reduce(
              (acc: Partial<Record<keyof NgDocPageIndex, NgDocHighlightPosition[]>>, key) => {
                acc[key] = [...asArray(acc[key]), ...Object.values(hit.positions[key]).flat()];

                return acc;
              },
              {},
            ),
          };
        }),
      ),
    );
  }

  private searchPages(
    db: OramaDb,
    query: string,
    pageType: { eq: string } | { nin: string[] },
  ): ReturnType<typeof searchWithHighlight> {
    return searchWithHighlight(db, {
      term: query,
      boost: { title: 4, section: 2 },
      threshold: 0.3,
      properties: [...SEARCHED_PROPERTIES],
      where: { pageType },
      tolerance: this.options?.tolerance,
      exact: this.options?.exact,
      // Each type may need the whole limit when the other one has few matches.
      limit: this.options?.limit ?? 10,
    });
  }

  private request<T>(url: string): Observable<T> {
    return defer(() => fetch(url)).pipe(
      switchMap((response: Response) => response.json() as Promise<T>),
    );
  }

  private createDatabase(pages: NgDocPageIndex[]): Observable<OramaDb> {
    return from(
      create({
        schema: { title: 'string', section: 'string', content: 'string', pageType: 'enum' },
        plugins: [{ name: 'highlight', afterInsert }],
        components: { tokenizer: { stemmer: this.options?.stemmer } },
      }),
    ).pipe(
      switchMap((db) =>
        from(insertMultiple(db, pages as any)).pipe(map(() => db as unknown as OramaDb)),
      ),
    );
  }
}

/**
 * Shares the limit between the guide and the API hits: guides first, with up to half of the
 * limit (rounded up) or whatever the API hits leave, then the API hits.
 * @param guides - The guide hits, in order of relevance.
 * @param others - The API hits, in order of relevance.
 * @param limit - The total number of results.
 */
function share<T>(guides: T[], others: T[], limit: number): T[] {
  const guideCount = Math.min(guides.length, Math.max(Math.ceil(limit / 2), limit - others.length));

  return [...guides.slice(0, guideCount), ...others.slice(0, limit - guideCount)];
}
