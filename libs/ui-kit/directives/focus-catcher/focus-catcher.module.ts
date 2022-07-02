import {NgModule} from '@angular/core';

import {NgDocFocusCatcherDirective} from './focus-catcher.directive';

@NgModule({
	declarations: [NgDocFocusCatcherDirective],
	exports: [NgDocFocusCatcherDirective],
})
export class NgDocFocusCatcherModule {}
