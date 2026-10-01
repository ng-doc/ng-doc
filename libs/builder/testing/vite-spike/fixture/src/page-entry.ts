import { MESSAGE } from '@fixture/token';
import type { NgDocPage } from '@ng-doc/core';

import { CounterComponent } from './counter';
const page: NgDocPage = {
  title: 'Vite spike',
  mdFile: 'index.md',
  demos: { Counter: CounterComponent },
  playgrounds: {
    counter: {
      target: CounterComponent,
      template: '<fixture-counter></fixture-counter>',
      inputs: { caption: 'Playground start', value: 4 },
    },
  },
  providers: [{ provide: MESSAGE, useValue: 'Provided by entry' }],
};
export default page;
