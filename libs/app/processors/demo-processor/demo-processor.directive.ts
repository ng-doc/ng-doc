import {Directive, ElementRef, Self, ViewContainerRef} from '@angular/core';
import {NgDocDemoViewerComponent} from '@ng-doc/app/components/demo-viewer';
import {NgDocMarkdownDirective} from '@ng-doc/app/directives/markdown';
import {NgDocHtmlProcessor} from '@ng-doc/app/processors/html-processor';
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
		super(elementRef, viewContainerRef, markdown, '#ng-doc-demo', NgDocDemoViewerComponent);
	}

	protected override extractComponentOptions(element: Element): Partial<NgDocDemoViewerComponent> {
		return {
			componentName: element.getAttribute('data-name') ?? undefined,
		};
	}
}
