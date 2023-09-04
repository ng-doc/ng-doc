import { Directive, TemplateRef, ViewContainerRef } from '@angular/core';

@Directive({
	selector: '[ngDocData]',
	standalone: true,
})
export class NgDocDataDirective {
	constructor(
		protected template: TemplateRef<unknown>,
		protected viewContainerRef: ViewContainerRef,
	) {}
}
