import { Directive, input } from '@angular/core';
import { NgDocDropdownComponent } from '@ng-doc/ui-kit/components/dropdown';

/** Opens the dropdown on ArrowDown and closes it on Escape while the host has focus. */
@Directive({
  selector: '[ngDocDropdownHandler]',
  host: {
    '(keydown)': 'keyboardEvent($event)',
  },
})
export class NgDocDropdownHandlerDirective {
  /** The dropdown the host controls. */
  readonly dropdown = input<NgDocDropdownComponent | undefined>(undefined, {
    alias: 'ngDocDropdownHandler',
  });

  keyboardEvent(event: KeyboardEvent): void {
    const dropdown: NgDocDropdownComponent | undefined = this.dropdown();

    if (dropdown) {
      if (event.key === 'ArrowDown' && !dropdown.isOpened) {
        event.preventDefault();
        dropdown.open();
      }

      if (event.key === 'Escape' && dropdown.isOpened) {
        event.preventDefault();
        dropdown.close();
      }
    }
  }
}
