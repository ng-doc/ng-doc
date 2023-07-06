import {NgDocTabsComponent} from '@ng-doc/app/components/tabs';
import {NgDocPageProcessor, NgDocTab} from '@ng-doc/app/interfaces';

export const tabsProcessor: NgDocPageProcessor<NgDocTabsComponent> = {
	component: NgDocTabsComponent,
	selector: 'ng-doc-tab',
	nodeToReplace: (element: Element) => {
		const anchor: Element = document.createElement('div');

		return element.parentNode?.insertBefore(anchor, element) ?? element;
	},
	extractOptions: (element: Element, root: Element) => {
		const group: string | null = element.getAttribute('group') ?? '';
		const tabs: Element[] = Array.from(root.querySelectorAll(`ng-doc-tab[group="${group}"]`));
		const mappedTabs: NgDocTab[] = tabs.map((tab: Element) => ({
			title: tab.getAttribute('name') ?? '',
			content: tab,
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
