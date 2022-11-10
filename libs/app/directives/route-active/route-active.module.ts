import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';

import {NgDocRouteActiveDirective} from './route-active.directive';

@NgModule({
	declarations: [NgDocRouteActiveDirective],
	imports: [CommonModule],
	exports: [NgDocRouteActiveDirective],
})
export class NgDocRouteActiveModule {}
