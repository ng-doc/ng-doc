import { Directive, Input, TemplateRef, ViewContainerRef } from '@angular/core';

import { NgDocLetContext } from './let-context';

@Directive({
	selector: '[ngDocLet]',
	standalone: true,
})
export class NgDocLetDirective<T> {
	@Input()
	ngDocLet!: T;

	constructor(
		private readonly viewContainer: ViewContainerRef,
		private readonly templateRef: TemplateRef<NgDocLetContext<T>>,
	) {
		this.viewContainer.createEmbeddedView(this.templateRef, new NgDocLetContext<T>(this));
	}

	static ngTemplateContextGuard<T>(
		_dir: NgDocLetDirective<T>,
		_ctx: unknown,
	): _ctx is NgDocLetDirective<T> {
		return true;
	}
}
