import {Directive, ElementRef, ViewContainerRef} from '@angular/core';
import {NgDocProcessorOptions} from '@ng-doc/app/interfaces';
import {NgDocHtmlProcessor} from '@ng-doc/app/processors/html-processor';
import {NgDocIconComponent, NgDocIconSize} from '@ng-doc/ui-kit';

@Directive({
	selector: '[ngDocIconProcessor]',
})
export class NgDocIconProcessorDirective extends NgDocHtmlProcessor<NgDocIconComponent> {
	constructor(
		protected override readonly elementRef: ElementRef<HTMLElement>,
		protected override readonly viewContainerRef: ViewContainerRef,
	) {
		super(elementRef, viewContainerRef, `ng-doc-icon`, NgDocIconComponent);
	}

	protected override extractComponentOptions(element: Element): NgDocProcessorOptions<NgDocIconComponent> {
		return {
			inputs: {
				icon: element.getAttribute('icon') ?? '',
				size: (Number(element.getAttribute('size')) as NgDocIconSize) ?? 16,
			},
		};
	}
}
