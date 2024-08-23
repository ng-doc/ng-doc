import { provideTypeControl } from '@ng-doc/app';
import { NgDocPage } from '@ng-doc/core';
import {
  NgDocButtonComponent,
  NgDocIconComponent,
  NgDocRotatorDirective,
  NgDocTagComponent,
} from '@ng-doc/ui-kit';

import WritingContentCategory from '../ng-doc.category';
import { FloatingCircleComponent } from './floating-circle/floating-circle.component';
import { FloatingCirclePositionControlComponent } from './floating-circle-position-control/floating-circle-position-control.component';
import { FormatDatePipe } from './format-date.pipe';

const PlaygroundPage: NgDocPage = {
  title: `Playground`,
  mdFile: ['./index.md', './type-controls.md'],
  category: WritingContentCategory,
  imports: [NgDocIconComponent],
  order: 8,
  providers: [
    provideTypeControl('FloatingCirclePosition', FloatingCirclePositionControlComponent, {
      hideLabel: true,
    }),
  ],
  demos: { FloatingCircleComponent, FloatingCirclePositionControlComponent },
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
    RotatorPlayground: {
      target: NgDocRotatorDirective,
      template: `<button ngDocRotator>Button</button>`,
    },
    DatePipePlayground: {
      target: FormatDatePipe,
      template: `{{'2023-06-05T08:00:00.000Z' | formatDate}}`,
    },
    ButtonPlayground: {
      target: NgDocButtonComponent,
      template: `<ng-doc-selector>{{data.label}}</ng-doc-selector>`,
      data: { label: 'Button' },
    },
    FloatingCircle: {
      target: FloatingCircleComponent,
      template: '<ng-doc-selector></ng-doc-selector>',
    },
  },
};

export default PlaygroundPage;
