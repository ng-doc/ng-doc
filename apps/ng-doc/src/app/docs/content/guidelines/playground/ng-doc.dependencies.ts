import {NgDocDependencies} from '@ng-doc/core';
import {NgDocTagComponent} from '@ng-doc/ui-kit';

import {PlaygroundModule} from './ng-doc.module';

const PlaygroundDependencies: NgDocDependencies = {
	module: PlaygroundModule,
	playgrounds: {
		TagPlayground: {
			target: NgDocTagComponent,
			template: `
				<ng-doc-selector>
					{{content.icon}}
					{{data.label}}
				</ng-doc-selector>
			`,
			content: {
				icon: {
					label: 'Icon',
					template: `<ng-doc-icon icon="at-sign"></ng-doc-icon>`,
				}
			},
			data: {
				label: 'This is tag',
			}
		}
	}
};

export default PlaygroundDependencies;
