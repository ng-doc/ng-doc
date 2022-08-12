import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocSelectionModule} from '@ng-doc/ui-kit/components/selection';
import {NgDocTextModule} from '@ng-doc/ui-kit/components/text';
import {PolymorpheusModule} from '@tinkoff/ng-polymorpheus';

import {NgDocTabComponent} from './tab/tab.component';
import {NgDocTabGroupComponent} from './tab-group.component';

@NgModule({
	declarations: [NgDocTabGroupComponent, NgDocTabComponent],
	imports: [CommonModule, PolymorpheusModule, NgDocTextModule, NgDocSelectionModule],
	exports: [NgDocTabGroupComponent, NgDocTabComponent],
})
export class NgDocTabGroupModule {}
