import {Directive, ElementRef, Self, ViewContainerRef} from '@angular/core';
import {NgDocHeaderComponent} from '@ng-doc/app/components/header';
import {NgDocMarkdownDirective} from '@ng-doc/app/directives/markdown';
import {NgDocProcessorOptions} from '@ng-doc/app/interfaces';
import {NgDocHtmlProcessor} from '@ng-doc/app/processors/html-processor';
import {NgDocHeaderLevel} from '@ng-doc/app/types';
import {NG_DOC_TITLE_TEMPLATE_ID} from '@ng-doc/builder/naming';

@Directive({
	selector: '[ngDocTitleProcessor]',
})
export class NgDocTitleProcessorDirective extends NgDocHtmlProcessor<NgDocHeaderComponent> {
	constructor(
		protected override readonly elementRef: ElementRef<HTMLElement>,
		protected override readonly viewContainerRef: ViewContainerRef,
		@Self() protected override readonly markdown: NgDocMarkdownDirective,
	) {
		super(elementRef, viewContainerRef, markdown, `#${NG_DOC_TITLE_TEMPLATE_ID}`, NgDocHeaderComponent);
	}

	protected override extractComponentOptions(element: Element): NgDocProcessorOptions<NgDocHeaderComponent> {
		return {
			inputs: {
				text: element.textContent ?? '',
				level: Number(element.getAttribute('data-level') ?? '1') as NgDocHeaderLevel,
			},
		};
	}
}
