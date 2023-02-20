import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocMediaQueryModule} from '@ng-doc/ui-kit';

import {NgDocCustomNavbarDirective, NgDocCustomSidebarDirective, NgDocRootComponent} from './root.component';

@NgModule({
	declarations: [NgDocRootComponent, NgDocCustomNavbarDirective, NgDocCustomSidebarDirective],
	imports: [CommonModule, NgDocMediaQueryModule],
	exports: [NgDocRootComponent, NgDocCustomNavbarDirective, NgDocCustomSidebarDirective],
})
export class NgDocRootModule {}
