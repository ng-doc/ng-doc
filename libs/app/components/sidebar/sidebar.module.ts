import {NgModule} from '@angular/core';
import {CommonModule} from '@angular/common';
import {NgDocSidebarComponent} from './sidebar.component';
import {NgDocSidebarCategoryComponent} from './sidebar-category/sidebar-category.component';
import {NgDocSidebarItemComponent} from './sidebar-item/sidebar-item.component';

@NgModule({
	declarations: [NgDocSidebarComponent, NgDocSidebarCategoryComponent, NgDocSidebarItemComponent],
	imports: [CommonModule],
	exports: [NgDocSidebarComponent],
})
export class NgDocSidebarModule {}
