import { Directive, input } from '@angular/core';

/**
 * Puts the host into the tab order (`tabindex="0"`) or takes it out (`tabindex="-1"`).
 */
@Directive({
  selector: '[ngDocFocusable]',
  exportAs: 'ngDocFocusable',
  host: {
    '[attr.tabIndex]': 'focusable() ? 0 : -1',
  },
})
export class NgDocFocusableDirective {
  /** Whether the host can be focused with the keyboard. */
  readonly focusable = input<boolean>(true, { alias: 'ngDocFocusable' });
}
