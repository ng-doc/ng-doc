import {Directive, ElementRef, ViewContainerRef} from '@angular/core';
import {NgDocProcessorOptions} from '@ng-doc/app/interfaces';
import {NgDocHtmlProcessor} from '@ng-doc/app/processors/html-processor';
import {NgDocBlockquoteComponent, NgDocBlockquoteType} from '@ng-doc/ui-kit';

@Directive({
	selector: '[ngDocBlockquoteProcessor]',
})
export class NgDocBlockquoteProcessorDirective extends NgDocHtmlProcessor<NgDocBlockquoteComponent> {
	constructor(
		protected override readonly elementRef: ElementRef<HTMLElement>,
		protected override readonly viewContainerRef: ViewContainerRef,
	) {
		super(elementRef, viewContainerRef, `ng-doc-blockquote`, NgDocBlockquoteComponent);
	}

	protected override extractComponentOptions(element: Element): NgDocProcessorOptions<NgDocBlockquoteComponent> {
		return {
			content: [Array.from(element.childNodes)],
			inputs: {
				type: (element.getAttribute('type') as NgDocBlockquoteType) || 'default',
			},
		};
	}
}
