import { NgDocAngularEntities, NgDocDeclarations, NgDocPage } from '@ng-doc/core';

import { ButtonDemoComponent } from './button-demo/button-demo.component';
import { DevelopDemoComponent } from './develop-demo/develop-demo.component';

const DevelopPage: NgDocPage = {
  title: 'Develop',
  mdFile: './index.md.nunj',
  // Internal sandbox: keep it out of the sidebar. In the new engine, `onlyForTags` also removes it
  // from builds without the `development` tag; the legacy builders ignore `onlyForTags`.
  hidden: true,
  onlyForTags: ['development'],
  data: {
    modifiers: ['abstract', 'static', 'async', 'readonly'],
    entities: {
      typescript: NgDocDeclarations,
      angular: NgDocAngularEntities,
    },
  },
  imports: [],
  demos: { DevelopDemoComponent, ButtonDemoComponent },
};

export default DevelopPage;
