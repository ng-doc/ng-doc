import {NgDocDependencies} from '@ng-doc/core';

import {ButtonDemoComponent} from './demos/button-demo/button-demo.component';
import {ButtonInlineDemoComponent} from './demos/button-inline-demo/button-inline-demo.component';
import {DemoPanePageModule} from './ng-doc.module';

const DemoPanePageDependencies: NgDocDependencies = {
	module: DemoPanePageModule,
	// Add your demos that you are going to use in the page here
	demo: {ButtonDemoComponent, ButtonInlineDemoComponent},
};

export default DemoPanePageDependencies;
