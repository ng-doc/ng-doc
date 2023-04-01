import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocListModule} from '@ng-doc/ui-kit/components/list';
import {NgDocOptionModule} from '@ng-doc/ui-kit/components/option';
import {NgDocOptionGroupModule} from '@ng-doc/ui-kit/components/option-group';
import {NgDocTextModule} from '@ng-doc/ui-kit/components/text';
import {PolymorpheusModule} from '@tinkoff/ng-polymorpheus';

import {NgDocDataListGroupComponent} from './data-list-group.component';

@NgModule({
	declarations: [NgDocDataListGroupComponent],
	imports: [
		CommonModule,
		NgDocListModule,
		NgDocOptionModule,
		PolymorpheusModule,
		NgDocOptionGroupModule,
		NgDocTextModule,
	],
	exports: [NgDocDataListGroupComponent],
})
export class NgDocDataListGroupModule {}
