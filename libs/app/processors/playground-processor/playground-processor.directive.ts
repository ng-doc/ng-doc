import {Directive, ElementRef, ViewContainerRef} from '@angular/core';
import {NgDocPlaygroundComponent} from '@ng-doc/app/components/playground';
import {NgDocProcessorOptions} from '@ng-doc/app/interfaces';
import {NgDocHtmlProcessor} from '@ng-doc/app/processors/html-processor';
import {isPresent} from '@ng-doc/core';

@Directive({
	selector: '[ngDocPlaygroundProcessor]',
	standalone: true,
})
export class NgDocPlaygroundProcessorDirective extends NgDocHtmlProcessor<NgDocPlaygroundComponent> {
	constructor(
		protected override readonly elementRef: ElementRef<HTMLElement>,
		protected override readonly viewContainerRef: ViewContainerRef,
	) {
		super(elementRef, viewContainerRef, `ng-doc-playground`, NgDocPlaygroundComponent);
	}

	protected override extractComponentOptions(element: Element): NgDocProcessorOptions<NgDocPlaygroundComponent> {
		return {
			inputs: {
				id: element.getAttribute('id') || undefined,
				properties: JSON.parse(element.querySelector('#data')?.textContent?.replace(/\n/g, '\\n') ?? '') || undefined,
				pipeName: element.querySelector('#pipeName')?.textContent || undefined,
				selectors: (element.querySelector('#selectors')?.textContent || '')
					.split(',')
					.map((selector: string) => selector.trim())
					.filter(isPresent),
				options: JSON.parse(element.querySelector('#options')?.textContent ?? '') || {},
			},
		};
	}
}
