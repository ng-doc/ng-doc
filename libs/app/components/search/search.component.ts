import {ChangeDetectionStrategy, ChangeDetectorRef, Component} from '@angular/core';
import {NgDocSearchEngine} from '@ng-doc/app/classes';
import {NgDocPageInfo} from '@ng-doc/core';
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
