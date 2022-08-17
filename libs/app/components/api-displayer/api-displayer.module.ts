import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {PolymorpheusModule} from '@tinkoff/ng-polymorpheus';

import {NgDocApiDisplayerComponent} from './api-displayer.component';

@NgModule({
	declarations: [NgDocApiDisplayerComponent],
	imports: [CommonModule, PolymorpheusModule],
	exports: [NgDocApiDisplayerComponent],
})
export class NgDocApiDisplayerModule {}
