import { Directive } from '@angular/core';
import { DIControl, provideHostControl } from 'di-controls';

/**
 * Host control for a group of state controls (for example `ng-doc-button-toggle`): the group's
 * model is the value of the checked control, so only one control is checked at a time.
 */
@Directive({
  selector: '[ngDocRadioGroup]',
  providers: [provideHostControl(NgDocRadioGroupDirective)],
})
export class NgDocRadioGroupDirective<T> extends DIControl<T> {
  constructor() {
    super();
  }
}
