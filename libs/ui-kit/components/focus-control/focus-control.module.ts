import {NgModule} from '@angular/core';
import {NgDocFocusableModule} from '@ng-doc/ui-kit/directives/focusable';

import {NgDocFocusControlComponent} from './focus-control.component';

@NgModule({
	declarations: [NgDocFocusControlComponent],
	imports: [NgDocFocusableModule],
	exports: [NgDocFocusControlComponent],
})
export class NgDocFocusControlModule {}
