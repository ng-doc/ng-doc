import {CommonModule, NgOptimizedImage} from '@angular/common';
import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';

import {BackgroundComponent} from './background/background.component';
import {LandingComponent} from './landing.component';
import {TileComponent} from './tile/tile.component';

@NgModule({
	imports: [
		CommonModule,
		RouterModule.forChild([
			{
				path: '',
				component: LandingComponent,
			},
		]),
		TileComponent,
		NgOptimizedImage,
		LandingComponent,
		BackgroundComponent,
	],
	exports: [RouterModule],
})
export class LandingModule {}
