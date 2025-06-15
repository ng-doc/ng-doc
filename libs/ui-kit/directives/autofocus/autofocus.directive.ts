import { Directive, ElementRef, inject, Input, OnInit } from '@angular/core';
import { NgDocFocusUtils } from '@ng-doc/ui-kit/utils';

@Directive({
  selector: '[ngDocAutofocus]',
  standalone: true,
})
export class NgDocAutofocusDirective implements OnInit {
  private elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

  @Input()
  selectAll: boolean = false;

  /** Inserted by Angular inject() migration for backwards compatibility */
  constructor(...args: unknown[]);

  constructor() {}

  ngOnInit(): void {
    const element: HTMLElement = this.elementRef.nativeElement;

    if (NgDocFocusUtils.isNativeKeyboardFocusable(element)) {
      element.focus();
    }

    if (this.selectAll && element instanceof HTMLInputElement) {
      Promise.resolve().then(() => element.select());
    }
  }
}
