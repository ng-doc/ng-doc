import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';
import {
	NgDocExpanderModule,
	NgDocIconModule,
	NgDocLineModule,
	NgDocRotatorModule,
	NgDocTextModule,
} from '@ng-doc/ui-kit';
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
	],
	exports: [NgDocSidebarComponent],
})
export class NgDocSidebarModule {}
