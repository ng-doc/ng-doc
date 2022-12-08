import {NgDocPlayground} from '@ng-doc/builder';
import {NgDocTagComponent} from '@ng-doc/ui-kit';

const PlaygroundPagePlayground: NgDocPlayground = {
	TagPlayground: {
		target: NgDocTagComponent,
		template: `<ng-doc-selector>Tag Label</ng-doc-selector>`,
	},
	TagIconPlayground: {
		target: NgDocTagComponent,
		template: `
			<ng-doc-selector>
				{{iconContent}}
				Tag Label
			</ng-doc-selector>`,
		dynamicContent: {
			iconContent: {
				label: 'icon',
				template: '<ng-doc-icon icon="info" [size]="16"></ng-doc-icon>'
			}
		},
	},
	TagDataPlayground: {
		target: NgDocTagComponent,
		template: `<ng-doc-selector>{{data.array | json}}</ng-doc-selector>`,
		data: {
			array: [1, 2, 3]
		}
	}
};

export default PlaygroundPagePlayground;
