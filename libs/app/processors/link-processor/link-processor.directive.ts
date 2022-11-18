import {Directive, ElementRef, ViewContainerRef} from '@angular/core';
import {NgDocLinkComponent} from '@ng-doc/app/components/link';
import {NgDocProcessorOptions} from '@ng-doc/app/interfaces';
import {NgDocHtmlProcessor} from '@ng-doc/app/processors/html-processor';
import {NG_DOC_LINK_TEMPLATE_ID} from '@ng-doc/builder/naming';

@Directive({
	selector: '[ngDocLinkProcessor]',
})
export class NgDocLinkProcessorDirective extends NgDocHtmlProcessor<NgDocLinkComponent> {
	constructor(
		protected override readonly elementRef: ElementRef<HTMLElement>,
		protected override readonly viewContainerRef: ViewContainerRef,
	) {
		super(elementRef, viewContainerRef, `#${NG_DOC_LINK_TEMPLATE_ID}`, NgDocLinkComponent);
	}

	protected override extractComponentOptions(element: Element): NgDocProcessorOptions<NgDocLinkComponent> {
		return {
			content: [[new Text(element.textContent ?? '')]],
			inputs: {
				path: element.getAttribute('data-path') ?? '',
			},
		};
	}
}
