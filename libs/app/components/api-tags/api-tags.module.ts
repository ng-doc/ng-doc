import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocTagModule, NgDocTooltipModule} from '@ng-doc/ui-kit';

import {NgDocApiTagsComponent} from './api-tags.component';

@NgModule({
	declarations: [NgDocApiTagsComponent],
	imports: [CommonModule, NgDocTagModule, NgDocTooltipModule],
	exports: [NgDocApiTagsComponent],
})
export class ApiTagsModule {}
