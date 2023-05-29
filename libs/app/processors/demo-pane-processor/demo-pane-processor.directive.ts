import {Directive, ElementRef, ViewContainerRef} from '@angular/core';
import {NgDocDemoPaneComponent} from '@ng-doc/app/components/demo-pane';
import {NgDocProcessorOptions} from '@ng-doc/app/interfaces';
import {NgDocHtmlProcessor} from '@ng-doc/app/processors/html-processor';
import {UntilDestroy} from '@ngneat/until-destroy';

/** Processor replaces html node with `NgDocDemoPaneComponent` to display demo */
@Directive({
    selector: '[ngDocDemoPaneProcessor]',
    standalone: true,
})
@UntilDestroy()
export class NgDocDemoPaneProcessorDirective extends NgDocHtmlProcessor<NgDocDemoPaneComponent> {
	constructor(
		protected override readonly elementRef: ElementRef<HTMLElement>,
		protected override readonly viewContainerRef: ViewContainerRef,
	) {
		super(elementRef, viewContainerRef, `ng-doc-demo-pane`, NgDocDemoPaneComponent);
	}

	protected override extractComponentOptions(element: Element): NgDocProcessorOptions<NgDocDemoPaneComponent> {
		return {
			inputs: {
				componentName: element.getAttribute('componentName') || undefined,
				options: JSON.parse(element.querySelector('#options')?.textContent ?? '') || {},
			},
		};
	}
}
