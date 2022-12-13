import {NgModule} from '@angular/core';

import {NgDocMediaQueryDirective} from './media-query.directive';

@NgModule({
	declarations: [NgDocMediaQueryDirective],
	exports: [NgDocMediaQueryDirective],
})
export class NgDocMediaQueryModule {}
