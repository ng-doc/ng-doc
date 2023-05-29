import {Directive, ElementRef, ViewContainerRef} from '@angular/core';
import {NgDocDemoComponent} from '@ng-doc/app/components/demo';
import {NgDocProcessorOptions} from '@ng-doc/app/interfaces';
import {NgDocHtmlProcessor} from '@ng-doc/app/processors/html-processor';
import {UntilDestroy} from '@ngneat/until-destroy';

/** Processor replaces html node with `NgDocDemoComponent` to display demo */
@Directive({
    selector: '[ngDocDemoProcessor]',
    standalone: true,
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
				options: JSON.parse(element.querySelector('#options')?.textContent ?? '') || {},
			},
		};
	}
}
