import {Directive, ElementRef, ViewContainerRef} from '@angular/core';
import {NgDocProcessorOptions} from '@ng-doc/app/interfaces';
import {NgDocHtmlProcessor} from '@ng-doc/app/processors/html-processor';

import {NgDocTooltipWrapperComponent} from './tooltip-wrapper.component';

@Directive({
	selector: '[ngDocTooltipProcessor]',
	standalone: true,
})
export class NgDocTooltipProcessorDirective extends NgDocHtmlProcessor<NgDocTooltipWrapperComponent> {
	constructor(
		protected override readonly elementRef: ElementRef<HTMLElement>,
		protected override readonly viewContainerRef: ViewContainerRef,
	) {
		super(elementRef, viewContainerRef, `[ngDocTooltip]`, NgDocTooltipWrapperComponent);
	}

	protected override extractComponentOptions(element: Element): NgDocProcessorOptions<NgDocTooltipWrapperComponent> {
		return {
			inputs: {
				content: element.getAttribute('ngDocTooltip') ?? '',
			},
			content: [[element.cloneNode(true)]],
		};
	}
}
