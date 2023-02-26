import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';
import {NgDocRouteActiveModule} from '@ng-doc/app/directives/route-active';
import {NgDocDotModule} from '@ng-doc/ui-kit/components/dot';
import {NgDocExpanderModule} from '@ng-doc/ui-kit/components/expander';
import {NgDocIconModule} from '@ng-doc/ui-kit/components/icon';
import {NgDocLineModule} from '@ng-doc/ui-kit/components/line';
import {NgDocTextModule} from '@ng-doc/ui-kit/components/text';
import {NgDocRotatorModule} from '@ng-doc/ui-kit/directives/rotator';
import {PolymorpheusModule} from '@tinkoff/ng-polymorpheus';

import {NgDocSidebarComponent} from './sidebar.component';
import {NgDocSidebarCategoryComponent} from './sidebar-category/sidebar-category.component';
import {NgDocSidebarItemComponent} from './sidebar-item/sidebar-item.component';

@NgModule({
	declarations: [NgDocSidebarComponent, NgDocSidebarCategoryComponent, NgDocSidebarItemComponent],
	imports: [
		CommonModule,
		RouterModule,
		NgDocTextModule,
		NgDocIconModule,
		NgDocExpanderModule,
		NgDocRotatorModule,
		NgDocLineModule,
		PolymorpheusModule,
		NgDocDotModule,
		NgDocRouteActiveModule,
	],
	exports: [NgDocSidebarComponent],
})
export class NgDocSidebarModule {}
