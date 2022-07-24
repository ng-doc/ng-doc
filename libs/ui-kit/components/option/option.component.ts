import {ChangeDetectionStrategy, ChangeDetectorRef, Component, HostListener, Inject, Optional} from '@angular/core';
import {NgDocListItem} from '@ng-doc/ui-kit/classes';
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
export class NgDocOptionComponent<T> extends FlControlSelector<T> implements NgDocListItem {
	protected hovered: boolean = false;

	constructor(
		protected override readonly changeDetectorRef: ChangeDetectorRef,
		@Inject(FlCompareHost)
		@Optional()
		protected override compareHost?: FlCompareHost<T | boolean | null>,
		@Inject(FL_CONTROL_HOST)
		@Optional()
		protected override host?: FlControlHost<T>,
	) {
		super(compareHost, host);
	}

	@HostListener('click')
	clickEvent(): void {
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
}
