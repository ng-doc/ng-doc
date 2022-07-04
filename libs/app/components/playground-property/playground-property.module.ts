import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocLabelModule, NgDocTooltipModule} from '@ng-doc/ui-kit';
import {PolymorpheusModule} from '@tinkoff/ng-polymorpheus';

import {NgDocPlaygroundPropertyComponent} from './playground-property.component';

@NgModule({
	declarations: [NgDocPlaygroundPropertyComponent],
	imports: [CommonModule, NgDocLabelModule, NgDocTooltipModule, PolymorpheusModule],
	exports: [NgDocPlaygroundPropertyComponent],
})
export class NgDocPlaygroundPropertyModule {}
