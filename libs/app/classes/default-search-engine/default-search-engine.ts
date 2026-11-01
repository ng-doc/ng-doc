import { NgDocSearchEngine } from '@ng-doc/app/classes/search-engine';
import { ɵNG_DOC_CONTENT_UPDATE_EVENT } from '@ng-doc/app/constants';
import { NgDocSearchResult } from '@ng-doc/app/interfaces';
import { asArray } from '@ng-doc/core/helpers/as-array';
import { NgDocPageIndex } from '@ng-doc/core/interfaces';
import { NgDocHighlightPosition } from '@ng-doc/ui-kit';
// Types only: Orama loads with the first search, so an application that imports NgDoc only in a
// lazy route keeps it out of its initial bundle, and readers who never search never load it.
import type { Orama } from '@orama/orama';
import type { OramaWithHighlight, searchWithHighlight } from '@orama/plugin-match-highlight';
import type { stemmer } from '@orama/stemmers/english';
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

/** The Orama functions the engine calls, loaded with the index. */
interface OramaApi {
  readonly searchWithHighlight: typeof searchWithHighlight;
}

/** The database of the index and the Orama functions that search it. */
interface OramaIndex {
  readonly db: OramaDb;
  readonly api: OramaApi;
}

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
  private db$: Observable<OramaIndex>;
  /** The loaded index, shared by every search until a development update replaces it. */
  private index?: Observable<OramaIndex>;

  constructor(private options?: NgDocDefaultSearchEngineOptions) {
    super();

    this.db$ = defer(() => (this.index ??= this.loadIndex()));
    this.refreshOnContentUpdates();
  }

  /**
   * Search the documentation for the given query.
   * @param query The query to search for.
   */
  search(query: string): Observable<NgDocSearchResult[]> {
    return this.db$.pipe(
      switchMap((index) =>
        // Each type of page is searched on its own, so that API references, which usually have
        // many more records, cannot push the guides out of the limit.
        from(
          Promise.all([
            this.searchPages(index, query, { eq: 'guide' }),
            this.searchPages(index, query, { nin: ['guide'] }),
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
    { db, api }: OramaIndex,
    query: string,
    pageType: { eq: string } | { nin: string[] },
  ): ReturnType<OramaApi['searchWithHighlight']> {
    return api.searchWithHighlight(db, {
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

  /**
   * The Vite development host updates an edited guide in place (`ɵNG_DOC_CONTENT_UPDATE_EVENT`);
   * when its search records changed too, the next search loads the index again, as a reloaded
   * page would. The listener holds the engine weakly, so an engine nobody uses any more stops
   * listening. Nothing dispatches the event outside the development host, and Angular's
   * production mode skips the listener altogether.
   */
  private refreshOnContentUpdates(): void {
    if ((typeof ngDevMode !== 'undefined' && !ngDevMode) || typeof window === 'undefined') return;
    const engine = new WeakRef(this);
    const listener = (event: Event): void => {
      const current = engine.deref();

      if (!current) window.removeEventListener(ɵNG_DOC_CONTENT_UPDATE_EVENT, listener);
      else if ((event as CustomEvent<{ search?: unknown } | null>).detail?.search === true) {
        current.index = undefined;
      }
    };

    window.addEventListener(ɵNG_DOC_CONTENT_UPDATE_EVENT, listener);
  }

  private loadIndex(): Observable<OramaIndex> {
    return this.request<NgDocPageIndex[]>(`assets/ng-doc/indexes.json`).pipe(
      switchMap((pages) => this.createDatabase(pages)),
      shareReplay(1),
    );
  }

  private request<T>(url: string): Observable<T> {
    return defer(() => fetch(url)).pipe(
      switchMap((response: Response) => response.json() as Promise<T>),
    );
  }

  private createDatabase(pages: NgDocPageIndex[]): Observable<OramaIndex> {
    return from(
      Promise.all([import('@orama/orama'), import('@orama/plugin-match-highlight')]),
    ).pipe(
      switchMap(([{ create, insertMultiple }, { afterInsert, searchWithHighlight: search }]) =>
        from(
          create({
            schema: { title: 'string', section: 'string', content: 'string', pageType: 'enum' },
            plugins: [{ name: 'highlight', afterInsert }],
            components: { tokenizer: { stemmer: this.options?.stemmer } },
          }),
        ).pipe(
          switchMap((db) =>
            from(insertMultiple(db, pages as any)).pipe(
              map(() => ({ db: db as unknown as OramaDb, api: { searchWithHighlight: search } })),
            ),
          ),
        ),
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
