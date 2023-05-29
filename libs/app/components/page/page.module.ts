import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {RouterLink} from '@angular/router';
import {
	NgDocBooleanControlModule,
	NgDocNumberControlModule,
	NgDocStringControlModule,
	NgDocTypeAliasControlModule,
} from '@ng-doc/app/type-controls';

import {NgDocPageComponent} from './page.component';

@NgModule({
	imports: [
		/* TypeControls */
		NgDocBooleanControlModule,
		NgDocNumberControlModule,
		NgDocStringControlModule,
		NgDocTypeAliasControlModule,
		CommonModule,
		RouterLink,
		NgDocPageComponent,
	],
	exports: [NgDocPageComponent],
})
export class NgDocPageModule {}
