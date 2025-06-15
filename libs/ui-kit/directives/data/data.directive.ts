import { Directive, inject, TemplateRef, ViewContainerRef } from '@angular/core';

@Directive({
  selector: '[ngDocData]',
  standalone: true,
})
export class NgDocDataDirective {
  protected template = inject<TemplateRef<unknown>>(TemplateRef);
  protected viewContainerRef = inject(ViewContainerRef);

  /** Inserted by Angular inject() migration for backwards compatibility */
  constructor(...args: unknown[]);

  constructor() {}
}
