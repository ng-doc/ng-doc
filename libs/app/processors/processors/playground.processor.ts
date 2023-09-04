import { NgDocPlaygroundComponent } from '@ng-doc/app/components/playground';
import { NgDocPageProcessor } from '@ng-doc/app/interfaces';
import { isPresent } from '@ng-doc/core';

export const playgroundProcessor: NgDocPageProcessor<NgDocPlaygroundComponent> = {
	component: NgDocPlaygroundComponent,
	selector: 'ng-doc-playground',
	extractOptions: (element: Element) => ({
		inputs: {
			id: element.getAttribute('id') || undefined,
			properties:
				JSON.parse(element.querySelector('#data')?.textContent?.replace(/\n/g, '\\n') ?? '') ||
				undefined,
			pipeName: element.querySelector('#pipeName')?.textContent || undefined,
			selectors: (element.querySelector('#selectors')?.textContent || '')
				.split(',')
				.map((selector: string) => selector.trim())
				.filter(isPresent),
			options: JSON.parse(element.querySelector('#options')?.textContent ?? '') || {},
		},
	}),
};
