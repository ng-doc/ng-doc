import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';
import {NgDocButtonModule, NgDocIconModule, NgDocMediaQueryModule, NgDocTextModule} from '@ng-doc/ui-kit';

import {BackgroundComponent} from './background/background.component';
import {LandingComponent} from './landing.component';

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
	],
	declarations: [LandingComponent, BackgroundComponent],
	exports: [RouterModule],
})
export class LandingModule {}
