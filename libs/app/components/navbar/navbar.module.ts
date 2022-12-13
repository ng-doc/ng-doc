import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocSearchModule} from '@ng-doc/app/components/search';
import {NgDocButtonIconModule, NgDocIconModule, NgDocMediaQueryModule} from '@ng-doc/ui-kit';
import {PolymorpheusModule} from '@tinkoff/ng-polymorpheus';

import {NgDocNavbarComponent} from './navbar.component';

@NgModule({
	declarations: [NgDocNavbarComponent],
	imports: [
		CommonModule,
		PolymorpheusModule,
		NgDocSearchModule,
		NgDocButtonIconModule,
		NgDocIconModule,
		NgDocMediaQueryModule,
	],
	exports: [NgDocNavbarComponent],
})
export class NgDocNavbarModule {}
