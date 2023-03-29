import {
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	ElementRef,
	HostBinding,
	Input,
	Optional,
	ViewChild,
} from '@angular/core';
import {NgDocSearchEngine} from '@ng-doc/app/classes/search-engine';
import {NgDocSearchResult} from '@ng-doc/app/interfaces';
import {NgDocPageType} from '@ng-doc/core';
import {NgDocHighlightPosition, observableState, StatedObservable} from '@ng-doc/ui-kit';
import {NgDocListHost} from '@ng-doc/ui-kit/classes';
import {UntilDestroy, untilDestroyed} from '@ngneat/until-destroy';
import {BehaviorSubject, NEVER, ReplaySubject, Subject} from 'rxjs';
import {filter, skip, switchMap} from 'rxjs/operators';

@Component({
	selector: 'ng-doc-search',
	templateUrl: './search.component.html',
	styleUrls: ['./search.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	providers: [
		{
			provide: NgDocListHost,
			useExisting: NgDocSearchComponent,
		},
	],
})
@UntilDestroy()
export class NgDocSearchComponent implements NgDocListHost {
	@Input()
	@HostBinding('attr.data-ng-doc-mod')
	mod: 'input' | 'icon' = 'input';

	@ViewChild('inputElement')
	inputElement?: ElementRef<HTMLElement>;

	searchTerm: string = '';

	readonly query$: BehaviorSubject<string> = new BehaviorSubject<string>('');
	readonly search$: StatedObservable<NgDocSearchResult[]>;

	constructor(
		private readonly elementRef: ElementRef<HTMLElement>,
		private readonly changeDetectorRef: ChangeDetectorRef,
		@Optional()
		private readonly searchEngine?: NgDocSearchEngine,
	) {
		if (!this.searchEngine) {
			throw new Error(`NgDoc: Search engine is not provided,
			please check this article: https://ng-doc.com/getting-started/installation#importing-global-modules
			to learn how to provide it.`);
		}

		this.search$ = this.query$.pipe(
			skip(1),
			switchMap((term: string) => this.searchEngine?.search(term).pipe(observableState()) ?? NEVER),
			untilDestroyed(this),
		);
	}

	get listHostOrigin(): ElementRef<HTMLElement> {
		return this.inputElement ?? this.elementRef;
	}

	groupByPage(result: NgDocSearchResult): string {
		return result.index.breadcrumbs;
	}

	getPageTypeForGroup(group: string, results: NgDocSearchResult[]): NgDocPageType {
		return results.find((item: NgDocSearchResult) => item.index.breadcrumbs === group)?.index.pageType ?? 'guide';
	}

	getPositions<T extends NgDocSearchResult, K extends keyof T['positions']>(key: K, item: T): NgDocHighlightPosition[] {
		return item.positions[key] ?? [];
	}
}
