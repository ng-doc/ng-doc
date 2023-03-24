import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';

import {NgDocPaneBackDirective, NgDocPaneComponent, NgDocPaneFrontDirective} from './pane.component';

@NgModule({
	declarations: [NgDocPaneComponent, NgDocPaneFrontDirective, NgDocPaneBackDirective],
	imports: [CommonModule],
	exports: [NgDocPaneComponent, NgDocPaneFrontDirective, NgDocPaneBackDirective],
})
export class NgDocPaneModule {}
