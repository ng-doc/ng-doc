import {ChangeDetectionStrategy, Component, HostBinding, Input} from '@angular/core';
import {NgDocSize} from '@ng-doc/ui-kit/types';

@Component({
	selector: 'ng-doc-spinner',
	templateUrl: './spinner.component.html',
	styleUrls: ['./spinner.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocSpinnerComponent {
	@Input()
	@HostBinding('attr.data-ng-doc-size')
	size: NgDocSize = 'medium';
}
