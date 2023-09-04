import { NgDocCodeComponent } from '@ng-doc/app/components/code';
import { NgDocPageProcessor } from '@ng-doc/app/interfaces';

export const codeProcessor: NgDocPageProcessor<NgDocCodeComponent> = {
	component: NgDocCodeComponent,
	selector: 'pre code',
	nodeToReplace: (element: Element) => element.closest('pre') ?? element,
	extractOptions: (element: Element) => ({
		inputs: {
			copyButton: element.getAttribute('copyButton') !== 'false',
			name: element.getAttribute('name') || undefined,
			icon: element.getAttribute('icon') || undefined,
			lineNumbers: element.getAttribute('lineNumbers') !== 'false',
		},
		content: [[element.closest('pre') ?? element]],
	}),
};
