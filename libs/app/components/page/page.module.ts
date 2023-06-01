import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {RouterLink} from '@angular/router';
import {provideTypeControl} from '@ng-doc/app/helpers';
import {
	NgDocBooleanControlComponent,
	NgDocNumberControlComponent,
	NgDocStringControlComponent,
	NgDocTypeAliasControlComponent,
} from '@ng-doc/app/type-controls';

import {NgDocPageComponent} from './page.component';

@NgModule({
	imports: [CommonModule, RouterLink, NgDocPageComponent],
	providers: [
		provideTypeControl('NgDocTypeAlias', NgDocTypeAliasControlComponent, {order: 10}),
		provideTypeControl('string', NgDocStringControlComponent, {order: 20}),
		provideTypeControl('number', NgDocNumberControlComponent, {order: 30}),
		provideTypeControl('boolean', NgDocBooleanControlComponent, {hideLabel: true, order: 40}),
	],
	exports: [NgDocPageComponent],
})
export class NgDocPageModule {}
