import {NgModule} from '@angular/core';
import {CommonModule} from '@angular/common';
import {NgDocSidebarComponent} from './sidebar.component';

@NgModule({
	declarations: [NgDocSidebarComponent],
	imports: [CommonModule],
	exports: [NgDocSidebarComponent],
})
export class NgDocSidebarModule {}
