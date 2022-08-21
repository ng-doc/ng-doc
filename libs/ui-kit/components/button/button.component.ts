import {ChangeDetectionStrategy, Component, HostBinding, Input} from '@angular/core';
import {NgDocColor, NgDocPaletteColor, NgDocSize} from '@ng-doc/ui-kit/types';

@Component({
	selector: 'button[ng-doc-button], a[ng-doc-button]',
	templateUrl: './button.component.html',
	styleUrls: ['./button.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocButtonComponent {
	@Input()
	@HostBinding('attr.data-ng-doc-size')
	size: NgDocSize = 'medium';

	@Input()
	@HostBinding('attr.data-ng-doc-color')
	color: NgDocColor | NgDocPaletteColor = 'primary';
}
