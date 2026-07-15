import { CdkOverlayOrigin } from '@angular/cdk/overlay';
import { Directive, ElementRef } from '@angular/core';
import { NgDocOverlayHost } from '@ng-doc/ui-kit/classes/overlay-host';

@Directive({
  selector: '[ngDocDropdownOrigin]',
  exportAs: 'ngDocDropdownOrigin',
  providers: [
    {
      provide: NgDocOverlayHost,
      useExisting: NgDocDropdownOriginDirective,
    },
  ],
  standalone: true,
})
export class NgDocDropdownOriginDirective extends CdkOverlayOrigin implements NgDocOverlayHost {
  origin: ElementRef<HTMLElement> = this.elementRef;
}
