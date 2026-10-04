import { Directive, Signal, signal, untracked } from '@angular/core';

import type { NgDocSelectionOriginDirective } from './selection-origin.directive';

/**
 * Tracks which of its `ngDocSelectionOrigin` elements is selected, so that an
 * `ng-doc-selection` inside it can highlight that element.
 */
@Directive({
  selector: '[ngDocSelectionHost]',
})
export class NgDocSelectionHostDirective {
  private readonly selectedElement = signal<HTMLElement | undefined>(undefined);

  /** Element of the selected origin, or `undefined` when none is selected. */
  readonly selected: Signal<HTMLElement | undefined> = this.selectedElement.asReadonly();

  /**
   * Updates the selection after an origin changed its state or went away.
   * @param origin - The origin whose state changed.
   * @param selected - Whether the origin is selected now.
   */
  changeSelected(origin: NgDocSelectionOriginDirective, selected: boolean): void {
    // Origins call this from their effects: reading the current selection must not subscribe
    // them to it.
    untracked(() => {
      const element: HTMLElement = origin.elementRef.nativeElement;

      if (selected) {
        this.selectedElement.set(element);
      } else if (this.selectedElement() === element) {
        this.selectedElement.set(undefined);
      }
    });
  }

  /**
   * Selects an element that cannot carry `ngDocSelectionOrigin`, because Angular does not render
   * it: for example a tab in the HTML of a generated page.
   * @param element - The element to highlight, or `undefined` to highlight none.
   */
  select(element: HTMLElement | undefined): void {
    this.selectedElement.set(element);
  }
}
