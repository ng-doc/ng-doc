import { DestroyRef, Directive, effect, ElementRef, inject, input } from '@angular/core';

import { NgDocSelectionHostDirective } from './selection-host.directive';

/**
 * Element that the `ng-doc-selection` of the closest `ngDocSelectionHost` highlights while
 * `ngDocSelectionOrigin` is `true`.
 */
@Directive({
  selector: '[ngDocSelectionOrigin]',
})
export class NgDocSelectionOriginDirective {
  /** The host element. */
  readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly selectionHost = inject(NgDocSelectionHostDirective);

  /** Whether the element is selected. */
  readonly selected = input<boolean>(false, { alias: 'ngDocSelectionOrigin' });

  constructor() {
    effect(() => this.selectionHost.changeSelected(this, this.selected()));

    inject(DestroyRef).onDestroy(() => this.selectionHost.changeSelected(this, false));
  }
}
