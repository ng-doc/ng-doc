import {ChangeDetectionStrategy, Component} from '@angular/core';
import {Observable, Subject} from 'rxjs';

@Component({
	selector: 'ng-doc-search',
	templateUrl: './search.component.html',
	styleUrls: ['./search.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocSearchComponent {
	searchTerm$: Subject<string> = new Subject<string>();
	search$: Observable<unknown>;

	constructor() {
		this.search$ = this.searchTerm$.pipe();
	}
}
