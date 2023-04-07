import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocCodeModule} from '@ng-doc/app/components/code';
import {NgDocPaneModule, NgDocTabGroupModule} from '@ng-doc/ui-kit';
import {PolymorpheusModule} from '@tinkoff/ng-polymorpheus';

import {NgDocDemoPaneComponent} from './demo-pane.component';

@NgModule({
	declarations: [NgDocDemoPaneComponent],
	imports: [CommonModule, NgDocPaneModule, PolymorpheusModule, NgDocCodeModule, NgDocTabGroupModule],
	exports: [NgDocDemoPaneComponent],
})
export class NgDocDemoPaneModule {}
