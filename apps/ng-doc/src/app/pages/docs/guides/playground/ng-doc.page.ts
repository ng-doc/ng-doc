import {NgDocPage} from '@ng-doc/core';
import {NgDocIconModule, NgDocTagComponent, NgDocTagModule} from '@ng-doc/ui-kit';

import GuidesCategory from '../ng-doc.category';

const PlaygroundPage: NgDocPage = {
  title: `Playground`,
  mdFile: './index.md',
  category: GuidesCategory,
  keyword: 'GuidesPlayground',
  imports: [NgDocTagModule, NgDocIconModule],
  playgrounds: {
    TagPlayground: {
      target: NgDocTagComponent,
      template: `<ng-doc-selector>Tag Label</ng-doc-selector>`,
    },
    TagIconPlayground: {
      target: NgDocTagComponent,
      template: `
			<ng-doc-selector>
				{{content.icon}}
				Tag Label
			</ng-doc-selector>`,
      content: {
        icon: {
          label: 'email icon',
          template: '<ng-doc-icon icon="at-sign" [size]="16"></ng-doc-icon>',
        },
      },
    },
    TagDataPlayground: {
      target: NgDocTagComponent,
      template: `<ng-doc-selector>{{data.array | json}}</ng-doc-selector>`,
      data: {
        array: [1, 2, 3],
      },
    },
  },
};

export default PlaygroundPage;
