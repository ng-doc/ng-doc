import {NgModule} from '@angular/core';
import {NgDocIconModule} from '@ng-doc/ui-kit/components/icon';
import {NgDocTagModule} from '@ng-doc/ui-kit/components/tag';

@NgModule({
	exports: [NgDocTagModule, NgDocIconModule],
})
export class PageModule {}
