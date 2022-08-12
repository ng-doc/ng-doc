import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';

import {NgDocSelectionComponent} from './selection.component';
import {NgDocSelectionHostDirective} from './selection-host.directive';
import {NgDocSelectionOriginDirective} from './selection-origin.directive';

@NgModule({
	declarations: [NgDocSelectionComponent, NgDocSelectionOriginDirective, NgDocSelectionHostDirective],
	imports: [CommonModule],
	exports: [NgDocSelectionComponent, NgDocSelectionOriginDirective, NgDocSelectionHostDirective],
})
export class NgDocSelectionModule {}
