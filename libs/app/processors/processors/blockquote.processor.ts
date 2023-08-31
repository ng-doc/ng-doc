import { NgDocPageProcessor } from '@ng-doc/app/interfaces';
import { NgDocBlockquoteComponent, NgDocBlockquoteType } from '@ng-doc/ui-kit';

export const blockquoteProcessor: NgDocPageProcessor<NgDocBlockquoteComponent> = {
	component: NgDocBlockquoteComponent,
	selector: 'ng-doc-blockquote',
	extractOptions: (element: Element) => ({
		content: [Array.from(element.childNodes)],
		inputs: {
			type: (element.getAttribute('type') as NgDocBlockquoteType) || 'default',
		},
	}),
};
