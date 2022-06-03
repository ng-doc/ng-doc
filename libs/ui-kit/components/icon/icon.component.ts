import {HttpClient} from '@angular/common/http';
import {
	ChangeDetectionStrategy,
	Component,
	ElementRef,
	HostBinding,
	Inject,
	Input,
	OnChanges,
	Optional,
} from '@angular/core';
import {NgDocCacheInterceptor} from '@ng-doc/ui-kit/interceptors';
import {NG_DOC_ASSETS_PATH} from '@ng-doc/ui-kit/tokens';
import {NgDocIconSize} from '@ng-doc/ui-kit/types';
import {Subject} from 'rxjs';
import {debounceTime, switchMap} from 'rxjs/operators';

@Component({
	selector: 'ng-doc-icon',
	template: '',
	styleUrls: ['./icon.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocIconComponent implements OnChanges {
	/** Icon name */
	@Input()
	icon: string = '';

	/** Icon size */
	@Input()
	@HostBinding('attr.data-ng-doc-size')
	size: NgDocIconSize = 16;

	private reload$: Subject<void> = new Subject<void>();

	constructor(
		private readonly elementRef: ElementRef<HTMLElement>,
		private readonly httpClient: HttpClient,
		@Inject(NG_DOC_ASSETS_PATH) @Optional() private assetsPath: string,
	) {
		this.reload$
			.pipe(
				switchMap(() =>
					this.httpClient.get(this.href, {
						responseType: 'text',
						params: {[NgDocCacheInterceptor.TOKEN]: 'true'},
					}),
				),
			)
			.subscribe((svg: string) => (this.elementRef.nativeElement.innerHTML = svg));
	}

	ngOnChanges(): void {
		this.reload$.next();
	}

	get href(): string {
		return `${this.assetsPath}/icons/${this.size}/${this.icon}.svg#${this.icon}`;
	}
}
