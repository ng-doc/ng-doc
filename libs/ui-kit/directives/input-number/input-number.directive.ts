import { Directive, forwardRef } from '@angular/core';
import { isPresent } from '@ng-doc/core/helpers/is-present';
import { NgDocBaseInput } from '@ng-doc/ui-kit/classes/base-input';
import { toElement } from '@ng-doc/ui-kit/helpers';

/** Directive turns a native input into a control whose model is a number */
@Directive({
  selector: `input[ngDocInputNumber]`,
  providers: [
    { provide: NgDocBaseInput, useExisting: forwardRef(() => NgDocInputNumberDirective) },
  ],
  host: {
    '(blur)': 'blurEvent()',
    '(input)': 'inputEvent()',
  },
})
export class NgDocInputNumberDirective extends NgDocBaseInput<number> {
  constructor() {
    super({
      onIncomingUpdate: (value) => {
        toElement(this.elementRef).value = isPresent(value) ? String(Number(value)) : '';
      },
    });
  }

  protected blurEvent(): void {
    this.touch();
  }

  protected inputEvent(): void {
    this.updateModel(Number(this.elementRef.nativeElement.value));
  }
}
