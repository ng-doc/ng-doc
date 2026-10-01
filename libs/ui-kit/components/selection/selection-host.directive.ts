import { computed, Directive, Signal, signal, untracked } from '@angular/core';

import type { NgDocSelectionOriginDirective } from './selection-origin.directive';

/**
 * Tracks which of its `ngDocSelectionOrigin` elements is selected, so that an
 * `ng-doc-selection` inside it can highlight that element.
 */
@Directive({
  selector: '[ngDocSelectionHost]',
})
export class NgDocSelectionHostDirective {
  private readonly selectedOrigin = signal<NgDocSelectionOriginDirective | undefined>(undefined);

  /** Element of the selected origin, or `undefined` when none is selected. */
  readonly selected: Signal<HTMLElement | undefined> = computed(
    () => this.selectedOrigin()?.elementRef.nativeElement,
  );

  /**
   * Updates the selection after an origin changed its state or went away.
   * @param origin - The origin whose state changed.
   * @param selected - Whether the origin is selected now.
   */
  changeSelected(origin: NgDocSelectionOriginDirective, selected: boolean): void {
    // Origins call this from their effects: reading the current selection must not subscribe
    // them to it.
    untracked(() => {
      if (selected) {
        this.selectedOrigin.set(origin);
      } else if (this.selectedOrigin() === origin) {
        this.selectedOrigin.set(undefined);
      }
    });
  }
}
