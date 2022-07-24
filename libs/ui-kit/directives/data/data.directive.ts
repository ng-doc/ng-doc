import {Directive, TemplateRef, ViewContainerRef} from '@angular/core';

@Directive({
	selector: '[ngDocData]',
})
export class NgDocDataDirective {
	constructor(protected template: TemplateRef<unknown>, protected viewContainerRef: ViewContainerRef) {}
}
