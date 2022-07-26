import {NgDocPlayground} from '@ng-doc/builder';
import {NgDocTagComponent} from '@ng-doc/ui-kit';

import {InlineDemoComponent} from './demo/inline-demo.component';

export const playground: NgDocPlayground = {
	playground1: {
		target: InlineDemoComponent,
		template: `<{{ngDocSelector}}>{{content}}</{{ngDocSelector}}>`,
		dynamicContent: {
			content: {
				label: 'My Content',
				template: `my-content`,
			},
		},
	},
	playground2: {
		target: NgDocTagComponent,
		template: `<{{ngDocSelector}}>My tag</{{ngDocSelector}}>`,
	},
};

export default playground;
