import {NgModule} from '@angular/core';

import {NgDocFocusableDirective} from './focusable.directive';

@NgModule({
	declarations: [NgDocFocusableDirective],
	exports: [NgDocFocusableDirective],
})
export class NgDocFocusableModule {}
