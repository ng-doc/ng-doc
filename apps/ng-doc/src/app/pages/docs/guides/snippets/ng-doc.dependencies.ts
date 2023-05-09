import {NgDocDependencies} from '@ng-doc/core';

import {ButtonInlineDemoComponent} from './demos/button-inline-demo/button-inline-demo.component';
import {DemoPageModule} from './ng-doc.module';

const DemoPageDependencies: NgDocDependencies = {
	// Add your module here
	module: DemoPageModule,
	// And all demos that you'd like to use
	demo: {ButtonInlineDemoComponent},
};

export default DemoPageDependencies;
