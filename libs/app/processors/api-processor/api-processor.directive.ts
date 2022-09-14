import {Directive, ElementRef, Self, ViewContainerRef} from '@angular/core';
import {NgDocApiDisplayerComponent} from '@ng-doc/app/components/api-displayer';
import {NgDocMarkdownDirective} from '@ng-doc/app/directives';
import {NgDocProcessorOptions} from '@ng-doc/app/interfaces';
import {NgDocHtmlProcessor} from '@ng-doc/app/processors/html-processor';
import {NG_DOC_EXPORTED_DECLARATION_TEMPLATE_ID} from '@ng-doc/builder/naming';

@Directive({
	selector: '[ngDocApiProcessor]',
})
export class NgDocApiProcessorDirective extends NgDocHtmlProcessor<NgDocApiDisplayerComponent> {
	constructor(
		protected override readonly elementRef: ElementRef<HTMLElement>,
		protected override readonly viewContainerRef: ViewContainerRef,
		@Self() protected override readonly markdown: NgDocMarkdownDirective,
	) {
		super(
			elementRef,
			viewContainerRef,
			markdown,
			`#${NG_DOC_EXPORTED_DECLARATION_TEMPLATE_ID}`,
			NgDocApiDisplayerComponent,
		);
	}

	protected override extractComponentOptions(element: Element): NgDocProcessorOptions<NgDocApiDisplayerComponent> {
		return {
			inputs: {
				api: JSON.parse(element.textContent ?? 'undefined'),
			},
		};
	}
}
