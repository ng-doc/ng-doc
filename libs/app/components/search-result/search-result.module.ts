import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';
import {NgDocKindIconModule} from '@ng-doc/app/components/kind-icon';
import {NgDocTextModule, NgDocTooltipModule} from '@ng-doc/ui-kit';

import {NgDocSearchResultComponent} from './search-result.component';

@NgModule({
	declarations: [NgDocSearchResultComponent],
	imports: [CommonModule, NgDocTextModule, RouterModule, NgDocKindIconModule, NgDocTooltipModule],
	exports: [NgDocSearchResultComponent],
})
export class NgDocSearchResultModule {}
