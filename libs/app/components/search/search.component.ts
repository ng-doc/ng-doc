import {
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	ElementRef,
	HostBinding,
	Input,
	NgZone,
	ViewChild,
} from '@angular/core';
import {Router} from '@angular/router';
import {NgDocSearchEngine} from '@ng-doc/app/classes/search-engine';
import {NgDocSearchResult} from '@ng-doc/app/interfaces';
import {NgDocPageType} from '@ng-doc/core';
import {NgDocHighlightPosition} from '@ng-doc/ui-kit';
import {NgDocListHost} from '@ng-doc/ui-kit/classes';
import {UntilDestroy, untilDestroyed} from '@ngneat/until-destroy';
import {FlControlHost, provideControlHost} from 'flex-controls';
import {Subject} from 'rxjs';
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
		provideControlHost(NgDocSearchComponent),
	],
})
@UntilDestroy()
export class NgDocSearchComponent extends FlControlHost<NgDocSearchResult> implements NgDocListHost {
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
		private readonly searchEngine: NgDocSearchEngine,
		protected override readonly changeDetectorRef: ChangeDetectorRef,
		private readonly router: Router,
		private readonly ngZone: NgZone,
	) {
		super();

		this.query$
			.pipe(
				switchMap((term: string) => this.searchEngine.search(term)),
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
			this.queryResult?.find((item: NgDocSearchResult) => item.index.breadcrumbs === group)?.index.pageType ??
			'guide'
		);
	}

	getPositions<T extends NgDocSearchResult, K extends keyof T['positions']>(
		key: K,
		item: T,
	): NgDocHighlightPosition[] {
		return item.positions[key] ?? [];
	}

	override incomingUpdate(obj: NgDocSearchResult | null): void {
		super.incomingUpdate(null);

		if (obj) {
			this.ngZone.run(() => this.router.navigate([obj.index.route]));
		}
	}
}
