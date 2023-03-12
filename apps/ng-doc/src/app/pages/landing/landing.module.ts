import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';
import {NgDocTextModule} from '@ng-doc/ui-kit';

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
	],
	declarations: [LandingComponent, BackgroundComponent],
	exports: [RouterModule],
})
export class LandingModule {}
