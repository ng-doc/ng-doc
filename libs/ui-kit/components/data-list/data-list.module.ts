import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocListModule} from '@ng-doc/ui-kit/components/list';
import {NgDocOptionModule} from '@ng-doc/ui-kit/components/option';
import {NgDocTextModule} from '@ng-doc/ui-kit/components/text';
import {PolymorpheusModule} from '@tinkoff/ng-polymorpheus';

import {NgDocDataListComponent} from './data-list.component';

@NgModule({
	declarations: [NgDocDataListComponent],
	imports: [CommonModule, NgDocListModule, NgDocOptionModule, NgDocTextModule, PolymorpheusModule],
	exports: [NgDocDataListComponent],
})
export class NgDocDataListModule {}
