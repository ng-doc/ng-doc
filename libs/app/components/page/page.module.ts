import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {RouterLink} from '@angular/router';
import {NgDocBreadcrumbModule} from '@ng-doc/app/components/breadcrumb';
import {NgDocPageMapModule} from '@ng-doc/app/components/toc';
import {NgDocSanitizeHtmlModule} from '@ng-doc/app/pipes/sanitize-html';
import {
	NgDocBlockquoteProcessorModule,
	NgDocCodeProcessorModule,
	NgDocDemoPaneProcessorModule,
	NgDocDemoProcessorModule,
	NgDocIconProcessorModule,
	NgDocLinkProcessorModule,
	NgDocPlaygroundProcessorModule,
	NgDocTooltipProcessorModule,
} from '@ng-doc/app/processors';
import {
	NgDocBooleanControlModule,
	NgDocNumberControlModule,
	NgDocStringControlModule,
	NgDocTypeAliasControlModule,
} from '@ng-doc/app/type-controls';
import {
	NgDocButtonIconModule,
	NgDocButtonModule,
	NgDocIconModule,
	NgDocMediaQueryModule,
	NgDocTextModule,
	NgDocTooltipModule,
} from '@ng-doc/ui-kit';

import {NgDocPageComponent} from './page.component';

@NgModule({
	declarations: [NgDocPageComponent],
	imports: [
		/* TypeControls */
		NgDocBooleanControlModule,
		NgDocNumberControlModule,
		NgDocStringControlModule,
		NgDocTypeAliasControlModule,

		CommonModule,
		NgDocDemoProcessorModule,
		NgDocIconProcessorModule,
		NgDocLinkProcessorModule,
		NgDocCodeProcessorModule,
		NgDocBlockquoteProcessorModule,
		NgDocSanitizeHtmlModule,
		NgDocPageMapModule,
		NgDocMediaQueryModule,
		NgDocTooltipProcessorModule,
		NgDocButtonIconModule,
		NgDocIconModule,
		NgDocTooltipModule,
		NgDocPlaygroundProcessorModule,
		RouterLink,
		NgDocButtonModule,
		NgDocTextModule,
		NgDocDemoPaneProcessorModule,
		NgDocBreadcrumbModule,
	],
	exports: [NgDocPageComponent],
})
export class NgDocPageModule {}
