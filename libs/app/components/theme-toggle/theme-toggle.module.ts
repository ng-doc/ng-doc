import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocButtonIconModule, NgDocIconModule, NgDocTooltipModule} from '@ng-doc/ui-kit';

import {NgDocThemeToggleComponent} from './theme-toggle.component';

@NgModule({
	declarations: [NgDocThemeToggleComponent],
	imports: [CommonModule, NgDocTooltipModule, NgDocButtonIconModule, NgDocIconModule],
	exports: [NgDocThemeToggleComponent],
})
export class NgDocThemeToggleModule {}
