import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocTextModule} from '@ng-doc/ui-kit/components/text';
import {PolymorpheusModule} from '@tinkoff/ng-polymorpheus';

import {NgDocTabComponent} from './tab/tab.component';
import {NgDocTabGroupComponent} from './tab-group.component';
import {TabSelectionComponent} from './tab-selection/tab-selection.component';

@NgModule({
	declarations: [NgDocTabGroupComponent, NgDocTabComponent, TabSelectionComponent],
	imports: [CommonModule, PolymorpheusModule, NgDocTextModule],
	exports: [NgDocTabGroupComponent, NgDocTabComponent],
})
export class NgDocTabGroupModule {}
