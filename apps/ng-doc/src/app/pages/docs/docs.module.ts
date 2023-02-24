import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';
import {NgDocRootModule, NgDocSidebarModule} from '@ng-doc/app';
import {NG_DOC_ROUTING} from '@ng-doc/generated';

import {DocsComponent} from './docs.component';

@NgModule({
	imports: [
		CommonModule,
		RouterModule.forChild([
			{path: '', redirectTo: 'getting-started/installation', pathMatch: 'full'},
			{path: '', component: DocsComponent, children: NG_DOC_ROUTING},
		]),
		NgDocRootModule,
		NgDocSidebarModule,
	],
	declarations: [DocsComponent],
	exports: [RouterModule],
})
export class DocsModule {}
