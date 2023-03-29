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
import {NgDocHighlightPosition} from '@ng-doc/ui-kit';
import {NgDocListHost} from '@ng-doc/ui-kit/classes';
import {UntilDestroy, untilDestroyed} from '@ngneat/until-destroy';
import {NEVER, Subject} from 'rxjs';
import {switchMap} from 'rxjs/operators';

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

	readonly query$: Subject<string> = new Subject<string>();
	queryResult: NgDocSearchResult[] = [];

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

		this.query$
			.pipe(
				switchMap((term: string) => this.searchEngine?.search(term) ?? NEVER),
				untilDestroyed(this),
			)
			.subscribe((result: NgDocSearchResult[]) => {
				this.queryResult = result;
				this.changeDetectorRef.markForCheck();
			});
	}

	get listHostOrigin(): ElementRef<HTMLElement> {
		return this.inputElement ?? this.elementRef;
	}

	groupByPage(result: NgDocSearchResult): string {
		return result.index.breadcrumbs;
	}

	getPageTypeForGroup(group: string): NgDocPageType {
		return (
			this.queryResult?.find((item: NgDocSearchResult) => item.index.breadcrumbs === group)?.index.pageType ?? 'guide'
		);
	}

	getPositions<T extends NgDocSearchResult, K extends keyof T['positions']>(key: K, item: T): NgDocHighlightPosition[] {
		return item.positions[key] ?? [];
	}
}
