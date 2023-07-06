import {NgDocDemoPaneComponent} from '@ng-doc/app/components/demo-pane';
import {NgDocPageProcessor} from '@ng-doc/app/interfaces';

export const demoPaneProcessor: NgDocPageProcessor<NgDocDemoPaneComponent> = {
	component: NgDocDemoPaneComponent,
	selector: 'ng-doc-demo-pane',
	extractOptions: (element: Element) => ({
		inputs: {
			componentName: element.getAttribute('componentName') || undefined,
			options: JSON.parse(element.querySelector('#options')?.textContent ?? '') || {},
		},
	}),
};
