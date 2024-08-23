import { Injector, Renderer2 } from '@angular/core';
import { NgDocTabsComponent } from '@ng-doc/app/components/tabs';
import { NgDocPageProcessor, NgDocTab } from '@ng-doc/app/interfaces';

export const tabsProcessor: NgDocPageProcessor<NgDocTabsComponent> = {
	component: NgDocTabsComponent,
	selector: 'ng-doc-tab',
	nodeToReplace: (element: Element, injector: Injector) => {
		const renderer: Renderer2 = injector.get(Renderer2);
		const anchor: Element = renderer.createElement('div');

		return element.parentNode?.insertBefore(anchor, element) ?? element;
	},
	extractOptions: (element: Element, root: Element) => {
		const group: string | null = element.getAttribute('group') ?? '';
		const tabs: Element[] = Array.from(root.querySelectorAll(`ng-doc-tab[group="${group}"]`));
		const mappedTabs: NgDocTab[] = tabs.map((tab: Element) => ({
			title: tab.getAttribute('name') ?? '',
			content: tab,
			icon: tab.getAttribute('icon') || undefined,
			active: tab.hasAttribute('active'),
		}));

		tabs.forEach((tab: Element) => tab.remove());

		return {
			inputs: {
				tabs: mappedTabs,
			},
		};
	},
};
