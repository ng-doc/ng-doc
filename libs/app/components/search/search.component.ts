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
import {NgDocPageType} from '@ng-doc/core';
import {NgDocHighlightPosition} from '@ng-doc/ui-kit';
import {NgDocListHost} from '@ng-doc/ui-kit/classes';
import {UntilDestroy, untilDestroyed} from '@ngneat/until-destroy';
import {Result} from '@orama/orama/dist/types';
import {Position, SearchResultWithHighlight} from '@orama/plugin-match-highlight';
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
export class NgDocSearchComponent extends FlControlHost<Result> implements NgDocListHost {
	@Input()
	@HostBinding('attr.data-ng-doc-mod')
	mod: 'input' | 'icon' = 'input';

	@ViewChild('inputElement')
	inputElement?: ElementRef<HTMLElement>;

	searchTerm: string = '';

	readonly query$: Subject<string> = new Subject<string>();
	queryResult?: SearchResultWithHighlight;

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
			.subscribe((result: SearchResultWithHighlight) => {
				this.queryResult = result;
				console.log(this.queryResult);
				this.changeDetectorRef.markForCheck();
			});
	}

	get listHostOrigin(): ElementRef<HTMLElement> {
		return this.inputElement ?? this.elementRef;
	}

	groupByPage(item: Result): string {
		return item.document['breadcrumbs'] as string;
	}

	getPageTypeForGroup(group: string): NgDocPageType {
		return this.queryResult?.hits.find((item?: Result) => item?.document['breadcrumbs'] === group)?.document[
			'pageType'
		] as NgDocPageType;
	}

	getPositions(key: string, item: SearchResultWithHighlight): NgDocHighlightPosition[] {
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		return Object.values(item.positions[key]).flat();
	}

	override incomingUpdate(obj: Result | null): void {
		super.incomingUpdate(null);

		if (obj) {
			this.ngZone.run(() => this.router.navigate([obj.document['route']]));
		}
	}
}
