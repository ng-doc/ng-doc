import {HttpClient} from '@angular/common/http';
import {
	ChangeDetectionStrategy,
	Component,
	ElementRef,
	HostBinding,
	inject,
	Input,
	OnChanges,
	OnInit,
} from '@angular/core';
import {NgDocCacheInterceptor} from '@ng-doc/ui-kit/interceptors';
import {NG_DOC_ASSETS_PATH, NG_DOC_CUSTOM_ICONS_PATH} from '@ng-doc/ui-kit/tokens';
import {NgDocIconSize} from '@ng-doc/ui-kit/types';
import {of, Subject} from 'rxjs';
import {catchError, startWith, switchMap} from 'rxjs/operators';

@Component({
	selector: 'ng-doc-icon',
	template: '',
	styleUrls: ['./icon.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
})
export class NgDocIconComponent implements OnChanges, OnInit {
	/** Icon name */
	@Input()
	@HostBinding('attr.data-ng-doc-icon')
	icon: string = '';

	/** Custom icon name, if not set, `icon` will be used */
	@Input()
	@HostBinding('attr.data-ng-doc-custom-icon')
	customIcon: string = '';

	/** Icon size */
	@Input()
	@HostBinding('attr.data-ng-doc-size')
	size: NgDocIconSize = 16;

	private readonly reload$: Subject<void> = new Subject<void>();
	private readonly assetsPath: string = inject(NG_DOC_ASSETS_PATH, {optional: true}) ?? '';
	private readonly customIconsPath: string =
		inject(NG_DOC_CUSTOM_ICONS_PATH, {optional: true}) ?? '';

	constructor(
		private readonly elementRef: ElementRef<HTMLElement>,
		private readonly httpClient: HttpClient,
	) {}

	ngOnChanges(): void {
		this.reload$.next();
	}

	ngOnInit(): void {
		this.reload$
			.pipe(
				startWith(null),
				switchMap(() =>
					this.httpClient
						.get(this.href, {
							responseType: 'text',
							params: {[NgDocCacheInterceptor.TOKEN]: 'true'},
						})
						.pipe(
							catchError((e: Error) => {
								console.error(e);

								return of('');
							}),
						),
				),
			)
			.subscribe((svg: string) => (this.elementRef.nativeElement.innerHTML = svg));
	}

	get href(): string {
		return this.customIcon
			? `${this.customIconsPath}/${this.customIcon}.svg#${this.customIcon}`
			: `${this.assetsPath}/icons/${this.size}/${this.icon}.svg#${this.icon}`;
	}
}
