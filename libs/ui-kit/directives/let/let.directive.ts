import {Directive, Inject, Input, TemplateRef, ViewContainerRef} from '@angular/core';

import {NgDocLetContext} from './let-context';

@Directive({
	selector: '[ngDocLet]',
})
export class NgDocLetDirective<T> {
	@Input()
	ngDocLet!: T;

	constructor(
		private readonly viewContainer: ViewContainerRef,
		private readonly templateRef: TemplateRef<NgDocLetContext<T>>,
	) {
		viewContainer.createEmbeddedView(templateRef, new NgDocLetContext<T>(this));
	}

	static ngTemplateContextGuard<T>(_dir: NgDocLetDirective<T>, _ctx: unknown): _ctx is NgDocLetDirective<T> {
		return true;
	}
}
