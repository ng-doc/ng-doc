import {NgDocDependencies} from '@ng-doc/core';

import {DemoPanePageModule} from './ng-doc.module';

const DemoPanePageDependencies: NgDocDependencies = {
	module: DemoPanePageModule,
	// Add your demos that you are going to use in the page here
	demo: {},
};

export default DemoPanePageDependencies;
