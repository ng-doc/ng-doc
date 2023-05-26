import {NgDocAngularEntities, NgDocDeclarations, NgDocPage} from '@ng-doc/core';

import {ButtonDemoComponent} from './button-demo/button-demo.component';
import {DevelopDemoComponent} from './develop-demo/develop-demo.component';
import {DevelopPageModule} from './ng-doc.module';

export const DevelopPage: NgDocPage = {
  title: 'Develop',
  mdFile: './index.md.nunj',
  onlyForTags: ['development'],
  data: {
    modifiers: ['abstract', 'static', 'async', 'readonly'],
    entities: {
      typescript: NgDocDeclarations,
      angular: NgDocAngularEntities,
    },
  },
  keyword: 'DevelopPage',
  module: DevelopPageModule,
  // Add your demos that you are going to use in the page here
  demos: {DevelopDemoComponent, ButtonDemoComponent},
};

export default DevelopPage;
