import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocSearchModule} from '@ng-doc/app/components/search';
import {NgDocButtonIconModule} from '@ng-doc/ui-kit/components/button-icon';
import {NgDocIconModule} from '@ng-doc/ui-kit/components/icon';
import {NgDocLetModule} from '@ng-doc/ui-kit/directives/let';
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
		NgDocLetModule,
	],
	exports: [NgDocNavbarComponent],
})
export class NgDocNavbarModule {}
