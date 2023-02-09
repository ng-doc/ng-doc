import {ChangeDetectionStrategy, Component, HostBinding, Input} from '@angular/core';
import {NgDocContent, NgDocHorizontalAlign} from '@ng-doc/ui-kit/types';

@Component({
	selector: 'label[ng-doc-label]',
	templateUrl: './label.component.html',
	styleUrls: ['./label.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocLabelComponent {
	@Input('ng-doc-label')
	label: NgDocContent = '';

	@Input()
	@HostBinding('attr.data-ng-doc-align')
	align: NgDocHorizontalAlign = 'left';
}
