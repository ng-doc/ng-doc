import {NgDocDependencies} from '@ng-doc/builder';

import {DemoComponent} from './demo/demo.component';
import {NgDocModule} from './ng-doc.module';

const ngDocDependencies: NgDocDependencies = {
	module: NgDocModule,
	demo: {DemoComponent}
}

export default ngDocDependencies;
