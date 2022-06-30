import {Directive, ElementRef, Self, ViewContainerRef} from '@angular/core';
import {NgDocDemoViewerComponent} from '@ng-doc/app/components/demo-viewer';
import {NgDocMarkdownDirective} from '@ng-doc/app/directives/markdown';
import {NgDocProcessorOptions} from '@ng-doc/app/interfaces';
import {NgDocHtmlProcessor} from '@ng-doc/app/processors/html-processor';
import {NG_DOC_DEMO_TEMPLATE_ID} from '@ng-doc/builder/naming';
import {UntilDestroy} from '@ngneat/until-destroy';

/** Processor replaces html node with `NgDocDemoViewerComponent` to display demo */
@Directive({
	selector: '[ngDocDemoProcessor]',
})
@UntilDestroy()
export class NgDocDemoProcessorDirective extends NgDocHtmlProcessor<NgDocDemoViewerComponent> {
	constructor(
		protected override readonly elementRef: ElementRef<HTMLElement>,
		protected override readonly viewContainerRef: ViewContainerRef,
		@Self() protected override readonly markdown: NgDocMarkdownDirective,
	) {
		super(elementRef, viewContainerRef, markdown, `#${NG_DOC_DEMO_TEMPLATE_ID}`, NgDocDemoViewerComponent);
	}

	protected override extractComponentOptions(element: Element): NgDocProcessorOptions<NgDocDemoViewerComponent> {
		return {
			inputs: {
				componentName: element.getAttribute('data-component-name') ?? undefined,
			}
		};
	}
}
