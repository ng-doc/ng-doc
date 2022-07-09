import {NgDocPlayground} from '@ng-doc/builder';

export const playground: NgDocPlayground = {
	playground1: {
		selectors: 'ng-doc-inline-demo',
		template: `<ng-doc-inline-demo></ng-doc-inline-demo>`,
	},
	playground2: {
		selectors: ['button[ng-doc-button]', 'button[ng-doc-button-outer]'],
		template: `<{{selector}}>{{iconContent}}</{{selector}}>`,
		dynamicContent: [{
			id: 'iconContent',
			label: 'Icon',
			template: '<div>my icon</div>'
		}]
	},
};

export default playground;
