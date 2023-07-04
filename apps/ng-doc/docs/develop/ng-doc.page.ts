import {NgDocAngularEntities, NgDocDeclarations, page} from '@ng-doc/core';

import {ButtonDemoComponent} from './button-demo/button-demo.component';
import {DevelopDemoComponent} from './develop-demo/develop-demo.component';

export default page({
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
  imports: [],
  demos: {DevelopDemoComponent, ButtonDemoComponent},
});
