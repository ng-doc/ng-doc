import { Directive } from '@angular/core';
import { DIControl, provideHostControl } from 'di-controls';

@Directive({
  selector: '[ngDocRadioGroup]',
  standalone: true,
  providers: [provideHostControl(NgDocRadioGroupDirective)],
})
export class NgDocRadioGroupDirective<T> extends DIControl<T> {
  constructor() {
    super();
  }
}
