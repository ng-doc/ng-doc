import {Directive, ElementRef, Self, ViewContainerRef} from '@angular/core';
import {NgDocMarkdownDirective} from '@ng-doc/app/directives/markdown';
import {NgDocProcessorOptions} from '@ng-doc/app/interfaces';
import {NgDocHtmlProcessor} from '@ng-doc/app/processors/html-processor';
import {NG_DOC_BLOCKQUOTE_TEMPLATE_ID} from '@ng-doc/builder/naming';
import {NgDocBlockquoteComponent, NgDocBlockquoteType} from '@ng-doc/ui-kit';

@Directive({
	selector: '[ngDocBlockquoteProcessor]',
})
export class NgDocBlockquoteProcessorDirective extends NgDocHtmlProcessor<NgDocBlockquoteComponent> {
	constructor(
		protected override readonly elementRef: ElementRef<HTMLElement>,
		protected override readonly viewContainerRef: ViewContainerRef,
		@Self() protected override readonly markdown: NgDocMarkdownDirective,
	) {
		super(elementRef, viewContainerRef, markdown, `#${NG_DOC_BLOCKQUOTE_TEMPLATE_ID}`, NgDocBlockquoteComponent);
	}

	protected override extractComponentOptions(element: Element): NgDocProcessorOptions<NgDocBlockquoteComponent> {
		return {
			content: [Array.from(element.childNodes)],
			inputs: {
				type: (element.getAttribute('data-type') as NgDocBlockquoteType) || 'default',
			},
		};
	}
}
