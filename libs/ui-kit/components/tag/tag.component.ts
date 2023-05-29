import {ChangeDetectionStrategy, Component, HostBinding, Input} from '@angular/core';
import {NgDocColor, NgDocPaletteColor, NgDocTagSize} from '@ng-doc/ui-kit/types';

@Component({
	selector: 'ng-doc-tag',
	templateUrl: './tag.component.html',
	styleUrls: ['./tag.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
})
export class NgDocTagComponent {
	@Input()
	@HostBinding('attr.data-ng-doc-color')
	color: NgDocColor | NgDocPaletteColor = 'primary';

	@Input()
	@HostBinding('attr.data-ng-doc-size')
	size: NgDocTagSize = 'medium';

	@Input()
	@HostBinding('attr.data-ng-doc-mod')
	mod: 'default' | 'light' = 'default';
}
