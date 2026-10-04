import { Directive, ElementRef, inject, input, OnInit } from '@angular/core';
import { NgDocFocusUtils } from '@ng-doc/ui-kit/utils';

/**
 * Focuses the host when it is created, if the host can take keyboard focus.
 */
@Directive({
  selector: '[ngDocAutofocus]',
})
export class NgDocAutofocusDirective implements OnInit {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Selects the whole value of an `input` host after focusing it. */
  readonly selectAll = input<boolean>(false);

  ngOnInit(): void {
    const element: HTMLElement = this.elementRef.nativeElement;

    if (NgDocFocusUtils.isNativeKeyboardFocusable(element)) {
      element.focus();
    }

    if (this.selectAll() && element instanceof HTMLInputElement) {
      // The value of a bound input is written after the directive initializes.
      Promise.resolve().then(() => element.select());
    }
  }
}
