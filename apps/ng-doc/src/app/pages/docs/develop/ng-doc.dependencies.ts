import {NgDocDependencies} from '@ng-doc/core';

import {ButtonDemoComponent} from './button-demo/button-demo.component';
import {DevelopDemoComponent} from './develop-demo/develop-demo.component';
import {DevelopPageModule} from './ng-doc.module';

const DevelopPageDependencies: NgDocDependencies = {
  module: DevelopPageModule,
  // Add your demos that you are going to use in the page here
  demo: {DevelopDemoComponent, ButtonDemoComponent},
};

export default DevelopPageDependencies;
