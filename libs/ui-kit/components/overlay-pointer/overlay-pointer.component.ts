import { NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, HostBinding, Input } from '@angular/core';
import {
	NgDocHorizontalAlign,
	NgDocOverlayRelativePosition,
	NgDocVerticalAlign,
} from '@ng-doc/ui-kit/types';

@Component({
	selector: 'ng-doc-overlay-pointer',
	templateUrl: './overlay-pointer.component.html',
	styleUrls: ['./overlay-pointer.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
	imports: [NgIf],
})
export class NgDocOverlayPointerComponent {
	@Input()
	@HostBinding('attr.data-ng-doc-overlay-position')
	overlayPosition: NgDocOverlayRelativePosition | null = null;

	@Input()
	@HostBinding('attr.data-ng-doc-overlay-align')
	overlayAlign: NgDocHorizontalAlign | NgDocVerticalAlign | null = null;

	@Input()
	withPointer: boolean = true;
}
