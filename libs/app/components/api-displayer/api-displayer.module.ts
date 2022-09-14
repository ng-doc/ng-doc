import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {ApiTagsModule} from '@ng-doc/app/components/api-tags';
import {PolymorpheusModule} from '@tinkoff/ng-polymorpheus';

import {NgDocApiDisplayerComponent} from './api-displayer.component';

@NgModule({
	declarations: [NgDocApiDisplayerComponent],
	imports: [CommonModule, PolymorpheusModule, ApiTagsModule],
	exports: [NgDocApiDisplayerComponent],
})
export class NgDocApiDisplayerModule {}
