import {NgDocPlayground} from '@ng-doc/builder';

import {InlineDemoComponent} from './demo/inline-demo.component';

export const playground: NgDocPlayground = {
	playground1: {
		target: InlineDemoComponent,
		selectors: ['[ng-doc-inline-demo]'],
		template: `<{{ngDocSelector}}>{{content}}</{{ngDocSelector}}>`,
		dynamicContent: {
			content: {
				label: 'My Content',
				template: `my-content`,
			},
		},
	},
};

export default playground;
