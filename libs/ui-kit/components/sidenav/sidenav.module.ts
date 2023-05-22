import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {PolymorpheusModule} from '@tinkoff/ng-polymorpheus';

import {NgDocSidenavComponent} from './sidenav.component';

@NgModule({
	declarations: [NgDocSidenavComponent],
	imports: [CommonModule, PolymorpheusModule],
	exports: [NgDocSidenavComponent],
})
export class NgDocSidenavModule {}
