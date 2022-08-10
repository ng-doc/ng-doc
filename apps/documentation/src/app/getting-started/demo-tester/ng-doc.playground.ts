import {NgDocPlayground} from '@ng-doc/builder';
import {NgDocTagComponent} from '@ng-doc/ui-kit';

import {InlineDemoComponent} from './demo/inline-demo.component';

export const playground: NgDocPlayground = {
	playground1: {
		target: InlineDemoComponent,
		template: `<ng-doc-selector>{{content}}</ng-doc-selector>`,
		dynamicContent: {
			content: {
				label: 'My Content',
				template: `my-content`,
			},
		},
	},
	playground2: {
		target: NgDocTagComponent,
		template: `<ng-doc-selector>My tag</ng-doc-selector>`,
	},
};

export default playground;
