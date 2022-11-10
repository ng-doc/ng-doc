import {ChangeDetectionStrategy, Component, HostBinding, Input} from '@angular/core';
import {NgDocPaletteColor} from '@ng-doc/ui-kit/types';

@Component({
	selector: 'ng-doc-dot',
	template: ``,
	styleUrls: ['./dot.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocDotComponent {
	@Input()
	@HostBinding('attr.data-ng-doc-color')
	color?: NgDocPaletteColor;
}
