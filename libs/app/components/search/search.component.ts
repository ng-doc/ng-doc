import {ChangeDetectionStrategy, ChangeDetectorRef, Component, HostBinding, Input} from '@angular/core';
import {SearchResultWithHighlight} from '@lyrasearch/plugin-match-highlight';
import {NgDocSearchEngine} from '@ng-doc/app/classes/search-engine';
import {SearchSchema} from '@ng-doc/app/interfaces';
import {NgDocPageInfo} from '@ng-doc/core/interfaces/page-info';
import {UntilDestroy, untilDestroyed} from '@ngneat/until-destroy';
import {Subject} from 'rxjs';
import {switchMap} from 'rxjs/operators';

@Component({
	selector: 'ng-doc-search',
	templateUrl: './search.component.html',
	styleUrls: ['./search.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
@UntilDestroy()
export class NgDocSearchComponent {
	@Input()
	@HostBinding('attr.data-ng-doc-mod')
	mod: 'input' | 'icon' = 'input';

	searchTerm: string = '';

	readonly query$: Subject<string> = new Subject<string>();
	queryResult: Array<SearchResultWithHighlight<SearchSchema>> = [];

	constructor(
		private readonly searchEngine: NgDocSearchEngine,
		private readonly changeDetectorRef: ChangeDetectorRef,
	) {
		this.query$
			.pipe(
				switchMap((term: string) => this.searchEngine.search(term)),
				untilDestroyed(this),
			)
			.subscribe((result: Array<SearchResultWithHighlight<SearchSchema>>) => {
				this.queryResult = result;
				console.log(this.queryResult);
				this.changeDetectorRef.markForCheck();
			});
	}

	groupByPage(item: SearchResultWithHighlight<SearchSchema>): string {
		return item.document.title;
	}
}
