import { Directive, inject, TemplateRef, ViewContainerRef } from '@angular/core';

/**
 * Keeps its template unrendered, so that a parent can query it (with `read: TemplateRef`) and
 * render it somewhere else, for example in a dropdown.
 */
@Directive({
  selector: '[ngDocData]',
})
export class NgDocDataDirective {
  protected readonly template = inject<TemplateRef<unknown>>(TemplateRef);
  protected readonly viewContainerRef = inject(ViewContainerRef);
}
