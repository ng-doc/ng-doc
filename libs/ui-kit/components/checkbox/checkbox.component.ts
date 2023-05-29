import {NgIf} from '@angular/common';
import {ChangeDetectionStrategy, Component, HostBinding, Inject, Input, Optional} from '@angular/core';
import {NgDocIconComponent} from '@ng-doc/ui-kit/components/icon';
import {NgDocCheckedChangeDirective} from '@ng-doc/ui-kit/directives/checked-change';
import {NgDocFocusableDirective} from '@ng-doc/ui-kit/directives/focusable';
import {NgDocColor} from '@ng-doc/ui-kit/types';
import {FL_CONTROL_HOST, FlCompareHost, FlControlHost, FlControlSelector} from 'flex-controls';

@Component({
	selector: 'ng-doc-checkbox',
	templateUrl: './checkbox.component.html',
	styleUrls: ['./checkbox.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
	imports: [NgDocCheckedChangeDirective, NgDocFocusableDirective, NgIf, NgDocIconComponent],
})
export class NgDocCheckboxComponent<T> extends FlControlSelector<T> {
	@Input()
	@HostBinding('attr.data-lu-color')
	color: NgDocColor = 'primary';

	constructor(
		@Inject(FlCompareHost)
		@Optional()
		protected override compareHost?: FlCompareHost<T | boolean | null>,
		@Inject(FL_CONTROL_HOST)
		@Optional()
		protected override host?: FlControlHost<T>,
	) {
		super(compareHost, host);
	}
}
