import {ChangeDetectionStrategy, Component, HostBinding, Input} from '@angular/core';
import {NgDocColor, NgDocPaletteColor} from '@ng-doc/ui-kit/types';

@Component({
	selector: 'ng-doc-tag',
	templateUrl: './tag.component.html',
	styleUrls: ['./tag.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocTagComponent {
	@Input()
	@HostBinding('attr.properties-ng-doc-color')
	color: NgDocColor | NgDocPaletteColor = 'primary';
}
