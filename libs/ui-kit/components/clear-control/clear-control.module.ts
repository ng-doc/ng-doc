import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocButtonIconModule} from '@ng-doc/ui-kit/components/button-icon';
import {NgDocIconModule} from '@ng-doc/ui-kit/components/icon';
import {NgDocFocusableModule} from '@ng-doc/ui-kit/directives/focusable';

import {NgDocClearControlComponent} from './clear-control.component';

@NgModule({
	declarations: [NgDocClearControlComponent],
	imports: [CommonModule, NgDocButtonIconModule, NgDocFocusableModule, NgDocIconModule, NgDocIconModule],
	exports: [NgDocClearControlComponent],
})
export class NgDocClearControlModule {}
