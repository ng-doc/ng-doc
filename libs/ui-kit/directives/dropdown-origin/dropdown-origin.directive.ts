import { CdkOverlayOrigin } from '@angular/cdk/overlay';
import { Directive, ElementRef, inject } from '@angular/core';
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
  origin: ElementRef<HTMLElement>;

  /** Inserted by Angular inject() migration for backwards compatibility */
  constructor(...args: unknown[]);

  constructor() {
    const origin = inject<ElementRef<HTMLElement>>(ElementRef);

    super(origin);

    this.origin = origin;
  }
}
