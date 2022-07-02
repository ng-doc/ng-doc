import {Directive, ElementRef, Self, ViewContainerRef} from '@angular/core';
import {NgDocCodeComponent} from '@ng-doc/app/components/code';
import {NgDocMarkdownDirective} from '@ng-doc/app/directives/markdown';
import {NgDocProcessorOptions} from '@ng-doc/app/interfaces';
import {NgDocHtmlProcessor} from '@ng-doc/app/processors/html-processor';
import {NG_DOC_CODE_TEMPLATE_ID} from '@ng-doc/builder/naming';

@Directive({
	selector: '[ngDocCodeProcessor]',
})
export class NgDocCodeProcessorDirective extends NgDocHtmlProcessor<NgDocCodeComponent> {
	constructor(
		protected override readonly elementRef: ElementRef<HTMLElement>,
		protected override readonly viewContainerRef: ViewContainerRef,
		@Self() protected override readonly markdown: NgDocMarkdownDirective,
	) {
		super(elementRef, viewContainerRef, markdown, `#${NG_DOC_CODE_TEMPLATE_ID}`, NgDocCodeComponent);
	}

	protected override extractComponentOptions(element: Element): NgDocProcessorOptions<NgDocCodeComponent> {
		return {
			inputs: {
				code: element.textContent ?? '',
				language: element.getAttribute('data-language') || 'html',
			}
		};
	}
}
