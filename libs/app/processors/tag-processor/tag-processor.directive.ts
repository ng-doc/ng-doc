import {Directive, ElementRef, ViewContainerRef} from '@angular/core';
import {NgDocProcessorOptions} from '@ng-doc/app/interfaces';
import {NgDocHtmlProcessor} from '@ng-doc/app/processors/html-processor';
import {NG_DOC_TAG_TEMPLATE_ID} from '@ng-doc/builder/naming';
import {NgDocColor, NgDocTagComponent} from '@ng-doc/ui-kit';

@Directive({
	selector: '[ngDocTagProcessor]',
})
export class NgDocTagProcessorDirective extends NgDocHtmlProcessor<NgDocTagComponent> {
	constructor(
		protected override readonly elementRef: ElementRef<HTMLElement>,
		protected override readonly viewContainerRef: ViewContainerRef,
	) {
		super(elementRef, viewContainerRef, `#${NG_DOC_TAG_TEMPLATE_ID}`, NgDocTagComponent);
	}

	protected override extractComponentOptions(element: Element): NgDocProcessorOptions<NgDocTagComponent> {
		return {
			content: [[new Text(element.textContent ?? '')]],
			inputs: {
				color: element.getAttribute('data-color') as NgDocColor,
			},
		};
	}
}
