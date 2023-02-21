import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';
import {NgDocModule, NgDocNavbarModule, NgDocRootModule, NgDocSidebarModule, NgDocThemeToggleModule} from '@ng-doc/app';
import {NG_DOC_ROUTING, NgDocGeneratedModule} from '@ng-doc/generated';
import {
	NgDocButtonIconModule,
	NgDocIconModule,
	NgDocMediaQueryModule,
	NgDocTagModule,
	NgDocTooltipModule,
} from '@ng-doc/ui-kit';

import {DocsComponent} from './docs.component';

@NgModule({
	imports: [
		CommonModule,
		RouterModule.forChild([
			{path: '', redirectTo: 'getting-started/installation', pathMatch: 'full'},
			{path: '', component: DocsComponent, children: NG_DOC_ROUTING},
		]),
		NgDocRootModule,
		NgDocNavbarModule,
		NgDocSidebarModule,
		NgDocTagModule,
		NgDocButtonIconModule,
		NgDocIconModule,
		NgDocTooltipModule,
		NgDocThemeToggleModule,
		NgDocMediaQueryModule,
	],
	declarations: [DocsComponent],
	exports: [RouterModule],
})
export class DocsModule {}
