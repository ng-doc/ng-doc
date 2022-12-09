import {NgDocPlayground} from '@ng-doc/builder';

import {FloatingCircleComponent} from './floating-circle/floating-circle.component';

const TypeControlsPagePlayground: NgDocPlayground = {
	floatingCircle: {
		target: FloatingCircleComponent,
		template: '<ng-doc-selector></ng-doc-selector>'
	}
}

export default TypeControlsPagePlayground;
