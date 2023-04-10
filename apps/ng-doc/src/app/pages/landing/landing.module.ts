import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';
import {NgDocCodeHighlighterModule, NgDocCodeModule} from '@ng-doc/app';
import {NgDocButtonModule, NgDocIconModule, NgDocMediaQueryModule, NgDocTextModule} from '@ng-doc/ui-kit';

import {BackgroundComponent} from './background/background.component';
import {LandingComponent} from './landing.component';
import {PaneComponent} from './pane/pane.component';

@NgModule({
	imports: [
		CommonModule,
		RouterModule.forChild([
			{
				path: '',
				component: LandingComponent,
			},
		]),
		NgDocTextModule,
		NgDocButtonModule,
		NgDocMediaQueryModule,
		NgDocIconModule,
		NgDocCodeModule,
		PaneComponent,
		NgDocCodeHighlighterModule,
	],
	declarations: [LandingComponent, BackgroundComponent],
	exports: [RouterModule],
})
export class LandingModule {}
