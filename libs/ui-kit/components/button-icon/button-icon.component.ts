import {ChangeDetectionStrategy, Component, HostBinding, Input} from '@angular/core';
import {NgDocSize} from '@ng-doc/ui-kit/types';

@Component({
	selector: 'button[ng-doc-button-icon]',
	templateUrl: './button-icon.component.html',
	styleUrls: ['./button-icon.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocButtonIconComponent {
	@Input()
	@HostBinding('attr.data-ng-doc-size')
	size: NgDocSize = 'medium';

	@Input()
	@HostBinding('attr.data-ng-doc-toggled')
	toggled: boolean = false;
}
