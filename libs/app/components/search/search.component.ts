import {ChangeDetectionStrategy, Component} from '@angular/core';
import {NgDocSearchEngine} from '@ng-doc/app/classes';
import * as lunr from 'lunr';
import {Observable, Subject} from 'rxjs';
import {switchMap} from 'rxjs/operators';

@Component({
	selector: 'ng-doc-search',
	templateUrl: './search.component.html',
	styleUrls: ['./search.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocSearchComponent {
	searchTerm$: Subject<string> = new Subject<string>();
	search$: Observable<unknown>;

	constructor(private readonly searchEngine: NgDocSearchEngine) {
		this.search$ = this.searchTerm$.pipe();

		this.searchTerm$
			.pipe(switchMap((term: string) => this.searchEngine.search(term)))
			.subscribe((result: lunr.Index.Result[]) => {
				console.log(result);
			});
	}
}
