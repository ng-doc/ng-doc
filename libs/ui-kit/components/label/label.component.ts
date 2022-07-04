import {ChangeDetectionStrategy, Component, HostBinding, Input} from '@angular/core';
import {NgDocContent, NgDocHorizontalAlign} from '@ng-doc/ui-kit/types';

/** Компонент для создания лейбла контрола */
@Component({
	selector: 'label[ng-doc-label]',
	templateUrl: './label.component.html',
	styleUrls: ['./label.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocLabelComponent {
	@Input('ng-doc-label')
	label: NgDocContent = '';

	/** Прилегание */
	@Input()
	@HostBinding('attr.data-ng-doc-align')
	align: NgDocHorizontalAlign = 'left';
}
