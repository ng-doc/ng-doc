import {Provider} from '@angular/core';
import {create, insertWithHooks, Lyra, ResolveSchema} from '@lyrasearch/lyra';
import {
	afterInsert,
	LyraWithHighlight,
	SearchResultWithHighlight,
	searchWithHighlight,
} from '@lyrasearch/plugin-match-highlight';
import {SearchSchema} from '@ng-doc/app/interfaces';
import {NgDocPageSectionIndex} from '@ng-doc/core/interfaces';
import {from, Observable} from 'rxjs';
import {map, shareReplay, switchMap} from 'rxjs/operators';

/**
 *
 */
export function provideSearchEngine(): Provider {
	return {
		provide: NgDocSearchEngine,
		useValue: new NgDocSearchEngine(),
	};
}

export class NgDocSearchEngine {
	private db$: Observable<LyraWithHighlight<SearchSchema>>;

	constructor() {
		this.db$ = from(
			create<SearchSchema>({
				schema: {
					sectionTitle: 'string',
					content: 'string',
				},
				components: {
					tokenizer: {
						enableStemming: false,
					},
				},
				hooks: {
					afterInsert,
				},
			}),
		).pipe(
			map((db: Lyra<SearchSchema>) => db as LyraWithHighlight<SearchSchema>),
			switchMap((db: LyraWithHighlight<SearchSchema>) =>
				this.request<NgDocPageSectionIndex[]>(`assets/ng-doc/indexes.json`).pipe(
					switchMap((pages: NgDocPageSectionIndex[]) =>
						Promise.all(
							pages.map((page: NgDocPageSectionIndex) =>
								insertWithHooks(db, page as unknown as ResolveSchema<SearchSchema>),
							),
						),
					),
					map(() => db),
				),
			),
			shareReplay(1),
		) as Observable<LyraWithHighlight<SearchSchema>>;
	}

	search(query: string): Observable<Array<SearchResultWithHighlight<SearchSchema>>> {
		return this.db$.pipe(
			switchMap((db: LyraWithHighlight<SearchSchema>) =>
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
