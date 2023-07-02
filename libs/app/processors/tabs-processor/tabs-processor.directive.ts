import {Directive, ElementRef, ViewContainerRef} from '@angular/core';
import {NgDocTabsComponent} from '@ng-doc/app/components/tabs';
import {NgDocProcessorOptions, NgDocTab} from '@ng-doc/app/interfaces';
import {NgDocHtmlProcessor} from '@ng-doc/app/processors/html-processor';

@Directive({
	selector: '[ngDocTabsProcessor]',
	standalone: true,
})
export class NgDocTabsProcessorDirective extends NgDocHtmlProcessor<NgDocTabsComponent> {
	constructor(
		protected override readonly elementRef: ElementRef<HTMLElement>,
		protected override readonly viewContainerRef: ViewContainerRef,
	) {
		super(elementRef, viewContainerRef, `ng-doc-tab`, NgDocTabsComponent);
	}

	protected override extractComponentOptions(element: Element, root: HTMLElement): NgDocProcessorOptions<NgDocTabsComponent> {
		const group: string | null = element.getAttribute('group') ?? '';
		const tabs: Element[] = Array.from(root.querySelectorAll(`ng-doc-tab[group="${group}"]`));
		const mappedTabs: NgDocTab[] = tabs.map((tab: Element) => this.mapTabs(tab));



		tabs.forEach((tab: Element) => tab.remove());

		return {
			inputs: {
				tabs: mappedTabs,
			},
		};
	}

	protected override replaceElement(element: Element): Element {
		const anchor: Element = document.createElement('div');

		return element.parentNode?.insertBefore(anchor, element) ?? element;
	}

	private mapTabs(element: Element): NgDocTab {
		return {
			title: element.getAttribute('name') ?? '',
			content: element,
			active: element.hasAttribute('active'),
		};
	}
}
