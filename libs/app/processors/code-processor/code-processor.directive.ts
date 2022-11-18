import {Directive, ElementRef, ViewContainerRef} from '@angular/core';
import {NgDocCodeComponent} from '@ng-doc/app/components/code';
import {NgDocProcessorOptions} from '@ng-doc/app/interfaces';
import {NgDocHtmlProcessor} from '@ng-doc/app/processors/html-processor';

@Directive({
	selector: '[ngDocCodeProcessor]',
})
export class NgDocCodeProcessorDirective extends NgDocHtmlProcessor<NgDocCodeComponent> {
	constructor(
		protected override readonly elementRef: ElementRef<HTMLElement>,
		protected override readonly viewContainerRef: ViewContainerRef,
	) {
		super(elementRef, viewContainerRef, `ng-doc-code`, NgDocCodeComponent);
	}

	protected override extractComponentOptions(element: Element): NgDocProcessorOptions<NgDocCodeComponent> {
		return {
			inputs: {
				code: element.textContent ?? '',
				language: element.getAttribute('language') || 'html',
				copyButton: element.getAttribute('copyButton') !== 'false',
			},
		};
	}
}
