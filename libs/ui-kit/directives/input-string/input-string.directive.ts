import { Directive, forwardRef } from '@angular/core';
import { isPresent } from '@ng-doc/core/helpers/is-present';
import { NgDocBaseInput } from '@ng-doc/ui-kit/classes/base-input';
import { toElement } from '@ng-doc/ui-kit/helpers';

/** Directive converts any input data or model to text */
@Directive({
  selector: `input[ngDocInputString]`,
  providers: [
    { provide: NgDocBaseInput, useExisting: forwardRef(() => NgDocInputStringDirective) },
  ],
  host: {
    '(blur)': 'blurEvent()',
    '(input)': 'inputEvent()',
  },
})
export class NgDocInputStringDirective extends NgDocBaseInput<string> {
  constructor() {
    super({
      onIncomingUpdate: (value) => {
        toElement(this.elementRef).value = isPresent(value) ? String(value) : '';
      },
    });
  }

  protected blurEvent(): void {
    this.touch();
  }

  protected inputEvent(): void {
    this.updateModel(this.elementRef.nativeElement.value);
  }
}
