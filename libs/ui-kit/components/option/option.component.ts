import {
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	ElementRef,
	HostBinding,
	HostListener,
	Inject,
	OnDestroy,
	Optional,
} from '@angular/core';
import {NgDocListItem} from '@ng-doc/ui-kit/classes/list-item';
import {NgDocListComponent} from '@ng-doc/ui-kit/components/list';
import {FL_CONTROL_HOST, FlCompareHost, FlControlHost, FlControlSelector} from 'flex-controls';

@Component({
	selector: 'ng-doc-option',
	template: '<ng-content></ng-content>',
	styleUrls: ['./option.component.scss'],
	providers: [
		{
			provide: NgDocListItem,
			useExisting: NgDocOptionComponent,
		},
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocOptionComponent<T> extends FlControlSelector<T> implements NgDocListItem, OnDestroy {
	@HostBinding('attr.data-ng-doc-hover')
	protected hovered: boolean = false;

	constructor(
		readonly elementRef: ElementRef<HTMLElement>,
		protected override readonly changeDetectorRef: ChangeDetectorRef,
		@Optional()
		private readonly list: NgDocListComponent<T>,
		@Inject(FlCompareHost)
		@Optional()
		protected override compareHost?: FlCompareHost<T | boolean | null>,
		@Inject(FL_CONTROL_HOST)
		@Optional()
		protected override host?: FlControlHost<T>,
	) {
		super(compareHost, host);
		this.list?.registerItem(this);
	}

	@HostListener('click')
	clickEvent(): void {
		this.select();
	}

	selectByUser(): void {
		this.select();
	}

	setActiveStyles(): void {
		this.hovered = true;
		this.changeDetectorRef.markForCheck();
	}

	setInactiveStyles(): void {
		this.hovered = false;
		this.changeDetectorRef.markForCheck();
	}

	override ngOnDestroy(): void {
		super.ngOnDestroy();
		this.list?.unregisterItem(this);
	}
}
