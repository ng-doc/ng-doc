import {NgModule} from '@angular/core';

import {NgDocDataDirective} from './data.directive';

@NgModule({
	declarations: [NgDocDataDirective],
	exports: [NgDocDataDirective],
})
export class NgDocDataModule {}
