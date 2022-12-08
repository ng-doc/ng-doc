import {CdkOverlayOrigin} from '@angular/cdk/overlay';
import {Directive, ElementRef} from '@angular/core';
import {NgDocOverlayHost} from '@ng-doc/ui-kit/classes/overlay-host';

@Directive({
	selector: '[ngDocDropdownOrigin]',
	exportAs: 'ngDocDropdownOrigin',
	providers: [
		{
			provide: NgDocOverlayHost,
			useExisting: NgDocDropdownOriginDirective,
		},
	],
})
export class NgDocDropdownOriginDirective extends CdkOverlayOrigin implements NgDocOverlayHost {
	constructor(public origin: ElementRef<HTMLElement>) {
		super(origin);
	}
}
