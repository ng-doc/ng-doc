import {NgDocPlayground} from '@ng-doc/builder';
import {NgDocComboboxComponent, NgDocTagComponent} from '@ng-doc/ui-kit';

import {InlineDemoComponent} from './demo/inline-demo.component';

export const playground: NgDocPlayground = {
	playground1: {
		target: InlineDemoComponent,
		template: `<ng-doc-selector>{{data.myString}}{{content}}</ng-doc-selector>`,
		dynamicContent: {
			content: {
				label: 'My Content',
				template: `my-content`,
			},
		},
		data: {
			myString: 'HAHA',
		},
	},
	playground2: {
		target: NgDocTagComponent,
		template: `<ng-doc-selector>My tag</ng-doc-selector>`,
	},
	comboboxPlayground: {
		target: NgDocComboboxComponent,
		template: `
			<ng-doc-selector>
				<ng-doc-list *ngDocData>
					<ng-doc-option *ngFor="let item of data.items" [value]="item">{{item}}</ng-doc-option>
				</ng-doc-list>
			</ng-doc-selector>`,
		data: {
			items: [1, 2, 3, 4],
		},
	},
};

export default playground;
