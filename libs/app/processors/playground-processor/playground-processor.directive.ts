import {Directive, ElementRef, Self, ViewContainerRef} from '@angular/core';
import {NgDocPlaygroundComponent} from '@ng-doc/app/components/playground';
import {NgDocMarkdownDirective} from '@ng-doc/app/directives/markdown';
import {NgDocProcessorOptions} from '@ng-doc/app/interfaces';
import {NgDocHtmlProcessor} from '@ng-doc/app/processors/html-processor';
import {NG_DOC_PLAYGROUND_TEMPLATE_ID} from '@ng-doc/builder/naming';

@Directive({
	selector: '[ngDocPlaygroundProcessor]',
})
export class NgDocPlaygroundProcessorDirective extends NgDocHtmlProcessor<NgDocPlaygroundComponent> {
	constructor(
		protected override readonly elementRef: ElementRef<HTMLElement>,
		protected override readonly viewContainerRef: ViewContainerRef,
		@Self() protected override readonly markdown: NgDocMarkdownDirective,
	) {
		super(elementRef, viewContainerRef, markdown, `#${NG_DOC_PLAYGROUND_TEMPLATE_ID}`, NgDocPlaygroundComponent);
	}

	protected override extractComponentOptions(element: Element): NgDocProcessorOptions<NgDocPlaygroundComponent> {
		return {
			inputs: {
				id: element.getAttribute('data-playground-id') || undefined,
				properties: JSON.parse(element.querySelector('#data')?.textContent ?? '') || undefined,
				selectors: (element.querySelector('#selectors')?.textContent || '')
					.split(',')
					.map((selector: string) => selector.trim()),
			},
		};
	}
}
