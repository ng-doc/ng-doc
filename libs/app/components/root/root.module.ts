import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocLetModule, NgDocMediaQueryModule, NgDocSidenavModule} from '@ng-doc/ui-kit';
import {PolymorpheusModule} from '@tinkoff/ng-polymorpheus';

import {NgDocCustomNavbarDirective, NgDocCustomSidebarDirective, NgDocRootComponent} from './root.component';

@NgModule({
	declarations: [NgDocRootComponent, NgDocCustomNavbarDirective, NgDocCustomSidebarDirective],
	imports: [CommonModule, NgDocMediaQueryModule, NgDocSidenavModule, NgDocLetModule, PolymorpheusModule],
	exports: [NgDocRootComponent, NgDocCustomNavbarDirective, NgDocCustomSidebarDirective],
})
export class NgDocRootModule {}
