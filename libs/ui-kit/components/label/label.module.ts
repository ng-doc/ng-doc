import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocLetModule} from '@ng-doc/ui-kit/directives/let';
import {PolymorpheusModule} from '@tinkoff/ng-polymorpheus';

import {NgDocLabelComponent} from './label.component';

@NgModule({
	declarations: [NgDocLabelComponent],
	imports: [CommonModule, PolymorpheusModule, NgDocLetModule],
	exports: [NgDocLabelComponent],
})
export class NgDocLabelModule {}
