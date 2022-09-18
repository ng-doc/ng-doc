import {Directive, ElementRef, Self, ViewContainerRef} from '@angular/core';
import {NgDocDeclarationTagComponent} from '@ng-doc/app/components/declaration-tag';
import {NgDocMarkdownDirective} from '@ng-doc/app/directives/markdown';
import {NgDocProcessorOptions} from '@ng-doc/app/interfaces';
import {NgDocHtmlProcessor} from '@ng-doc/app/processors/html-processor';
import {NG_DOC_DECLARATION_TAG_TEMPLATE_ID} from '@ng-doc/builder/naming';

@Directive({
	selector: '[ngDocDeclarationTagProcessor]',
})
export class NgDocDeclarationTagProcessorDirective extends NgDocHtmlProcessor<NgDocDeclarationTagComponent> {
	constructor(
		protected override readonly elementRef: ElementRef<HTMLElement>,
		protected override readonly viewContainerRef: ViewContainerRef,
		@Self() protected override readonly markdown: NgDocMarkdownDirective,
	) {
		super(
			elementRef,
			viewContainerRef,
			markdown,
			`#${NG_DOC_DECLARATION_TAG_TEMPLATE_ID}`,
			NgDocDeclarationTagComponent,
		);
	}

	protected override extractComponentOptions(element: Element): NgDocProcessorOptions<NgDocDeclarationTagComponent> {
		return {
			inputs: {
				kind: element.textContent || '',
			},
		};
	}
}
