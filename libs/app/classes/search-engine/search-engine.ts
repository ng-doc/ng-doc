import {Provider} from '@angular/core';
import {SearchSchema} from '@ng-doc/app/interfaces';
import {NgDocPageSectionIndex} from '@ng-doc/core/interfaces';
import {create, insert, Orama} from '@orama/orama';
import {
	afterInsert,
	OramaWithHighlight,
	SearchResultWithHighlight,
	searchWithHighlight,
} from '@orama/plugin-match-highlight';
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
	private db$: Observable<OramaWithHighlight>;

	constructor() {
		this.db$ = from(
			create({
				schema: {
					sectionTitle: 'string',
					content: 'string',
				},
				components: {
					afterInsert: [afterInsert],
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

	search(query: string): Observable<SearchResultWithHighlight[]> {
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
