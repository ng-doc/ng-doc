import {Directive, ElementRef, ViewContainerRef} from '@angular/core';
import {NgDocDemoComponent} from '@ng-doc/app/components/demo';
import {asBoolean} from '@ng-doc/app/helpers';
import {NgDocProcessorOptions} from '@ng-doc/app/interfaces';
import {NgDocHtmlProcessor} from '@ng-doc/app/processors/html-processor';
import {NG_DOC_DEMO_TEMPLATE_ID} from '@ng-doc/builder/naming';
import {UntilDestroy} from '@ngneat/until-destroy';

/** Processor replaces html node with `NgDocDemoViewerComponent` to display demo */
@Directive({
	selector: '[ngDocDemoProcessor]',
})
@UntilDestroy()
export class NgDocDemoProcessorDirective extends NgDocHtmlProcessor<NgDocDemoComponent> {
	constructor(
		protected override readonly elementRef: ElementRef<HTMLElement>,
		protected override readonly viewContainerRef: ViewContainerRef,
	) {
		super(elementRef, viewContainerRef, `ng-doc-demo`, NgDocDemoComponent);
	}

	protected override extractComponentOptions(element: Element): NgDocProcessorOptions<NgDocDemoComponent> {
		return {
			inputs: {
				componentName: element.getAttribute('componentName') || undefined,
				container: asBoolean(element.getAttribute('container')) || true,
			},
		};
	}
}
