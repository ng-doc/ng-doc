import {NgDocPlayground} from '@ng-doc/builder';
import {NgDocTagComponent} from '@ng-doc/ui-kit';

export const ngDocPlayground: NgDocPlayground = {
	playground1: {
		target: NgDocTagComponent,
		template: '<ng-doc-selector>Tag Content</ng-doc-selector>',
	},
};

export default ngDocPlayground;
