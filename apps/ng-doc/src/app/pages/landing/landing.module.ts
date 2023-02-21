import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';

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
	],
	declarations: [LandingComponent],
	exports: [RouterModule],
})
export class LandingModule {}
