import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';
import {NgDocTextModule} from '@ng-doc/ui-kit';

import {NgDocSidebarComponent} from './sidebar.component';
import {NgDocSidebarCategoryComponent} from './sidebar-category/sidebar-category.component';
import {NgDocSidebarItemComponent} from './sidebar-item/sidebar-item.component';

@NgModule({
	declarations: [NgDocSidebarComponent, NgDocSidebarCategoryComponent, NgDocSidebarItemComponent],
	imports: [CommonModule, RouterModule, NgDocTextModule],
	exports: [NgDocSidebarComponent],
})
export class NgDocSidebarModule {}
