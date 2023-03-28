import {Directive, ElementRef, ViewContainerRef} from '@angular/core';
import {NgDocPageLinkComponent} from '@ng-doc/app/components/page-link';
import {NgDocProcessorOptions} from '@ng-doc/app/interfaces';
import {NgDocHtmlProcessor} from '@ng-doc/app/processors/html-processor';

@Directive({
	selector: '[ngDocLinkProcessor]',
})
export class NgDocLinkProcessorDirective extends NgDocHtmlProcessor<NgDocPageLinkComponent> {
	constructor(
		protected override readonly elementRef: ElementRef<HTMLElement>,
		protected override readonly viewContainerRef: ViewContainerRef,
	) {
		super(elementRef, viewContainerRef, `a`, NgDocPageLinkComponent);
	}

	protected override extractComponentOptions(element: Element): NgDocProcessorOptions<NgDocPageLinkComponent> {
		return {
			inputs: {
				href: element.getAttribute('href') ?? '',
				classes: element.getAttribute('class') ?? '',
			},
			content: [Array.from(element.childNodes)],
		};
	}
}
