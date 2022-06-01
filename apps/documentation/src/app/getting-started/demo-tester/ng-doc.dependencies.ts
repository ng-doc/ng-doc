import {NgDocPageDependencies} from '@ng-doc/builder';

import {DemoWithFilesComponent} from './demo/demo-with-files/demo-with-files.component';
import {InlineDemoComponent} from './demo/inline-demo.component';
import {PageModule} from './ng-doc.module';

const pageDependencies: NgDocPageDependencies = {
	module: PageModule,
	demo: {InlineDemoComponent, DemoWithFilesComponent},
};

export default pageDependencies;
