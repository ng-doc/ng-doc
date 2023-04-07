import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocCodeModule} from '@ng-doc/app/components/code';
import {NgDocCodeHighlighterModule} from '@ng-doc/app/directives/code-highlighter';
import {
    NgDocButtonIconModule,
    NgDocExpanderModule,
    NgDocIconModule,
    NgDocSmoothResizeModule,
    NgDocTooltipModule
} from '@ng-doc/ui-kit';
import {PolymorpheusModule} from '@tinkoff/ng-polymorpheus';

import {NgDocDemoDisplayerComponent} from './demo-displayer.component';

@NgModule({
	declarations: [NgDocDemoDisplayerComponent],
	imports: [
		CommonModule,
		PolymorpheusModule,
		NgDocExpanderModule,
		NgDocCodeModule,
		NgDocButtonIconModule,
		NgDocIconModule,
		NgDocTooltipModule,
		NgDocCodeHighlighterModule,
		NgDocSmoothResizeModule,
	],
	exports: [NgDocDemoDisplayerComponent],
})
export class NgDocDemoDisplayerModule {}
