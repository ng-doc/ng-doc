import {NgDocDependencies} from '@ng-doc/builder';

import {DemoWithFilesComponent} from './demo/demo-with-files/demo-with-files.component';
import {InlineDemoComponent} from './demo/inline-demo.component';
import {PageModule} from './ng-doc.module';

const pageDependencies: NgDocDependencies = {
	module: PageModule,
	demo: {InlineDemoComponent, DemoWithFilesComponent},
};

export default pageDependencies;
