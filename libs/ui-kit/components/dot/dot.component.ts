import {ChangeDetectionStrategy, Component, HostBinding, Input} from '@angular/core';
import {NgDocPaletteColor, NgDocSize} from '@ng-doc/ui-kit/types';

@Component({
	selector: 'ng-doc-dot',
	template: ``,
	styleUrls: ['./dot.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
})
export class NgDocDotComponent {
	@Input()
	@HostBinding('attr.data-ng-doc-color')
	color?: NgDocPaletteColor;

	@Input()
	@HostBinding('attr.data-ng-doc-size')
	size?: NgDocSize;
}
