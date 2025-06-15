import { Directive, inject, Input, TemplateRef, ViewContainerRef } from '@angular/core';

import { NgDocLetContext } from './let-context';

@Directive({
  selector: '[ngDocLet]',
  standalone: true,
})
export class NgDocLetDirective<T> {
  private readonly viewContainer = inject(ViewContainerRef);
  private readonly templateRef = inject<TemplateRef<NgDocLetContext<T>>>(TemplateRef);

  @Input()
  ngDocLet!: T;

  /** Inserted by Angular inject() migration for backwards compatibility */
  constructor(...args: unknown[]);

  constructor() {
    this.viewContainer.createEmbeddedView(this.templateRef, new NgDocLetContext<T>(this));
  }

  static ngTemplateContextGuard<T>(
    _dir: NgDocLetDirective<T>,
    _ctx: unknown,
  ): _ctx is NgDocLetDirective<T> {
    return true;
  }
}
