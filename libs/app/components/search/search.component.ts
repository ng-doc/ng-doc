import {ChangeDetectionStrategy, ChangeDetectorRef, Component, HostBinding, Input} from '@angular/core';
import {NgDocSearchEngine} from '@ng-doc/app/classes/search-engine';
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
	queryResult: NgDocPageInfo[] = [];

	constructor(
		private readonly searchEngine: NgDocSearchEngine,
		private readonly changeDetectorRef: ChangeDetectorRef,
	) {
		this.query$
			.pipe(
				switchMap((term: string) => this.searchEngine.search(term)),
				untilDestroyed(this),
			)
			.subscribe((result: NgDocPageInfo[]) => {
				this.queryResult = result;
				this.changeDetectorRef.markForCheck();
			});
	}
}
