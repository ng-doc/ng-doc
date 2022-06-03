import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {PolymorpheusModule} from '@tinkoff/ng-polymorpheus';

import {NgDocExpanderComponent} from './expander.component';

@NgModule({
	declarations: [NgDocExpanderComponent],
	imports: [CommonModule, PolymorpheusModule],
	exports: [NgDocExpanderComponent],
})
export class NgDocExpanderModule {}
