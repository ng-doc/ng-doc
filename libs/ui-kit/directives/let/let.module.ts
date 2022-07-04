import {NgModule} from '@angular/core';

import {NgDocLetDirective} from './let.directive';

@NgModule({
	declarations: [NgDocLetDirective],
	exports: [NgDocLetDirective],
})
export class NgDocLetModule {}
