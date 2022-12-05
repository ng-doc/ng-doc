import {NgModule} from '@angular/core';
import {NgDocIconModule, NgDocTagModule} from '@ng-doc/ui-kit';

@NgModule({
	exports: [NgDocTagModule, NgDocIconModule],
})
export class PageModule {}
