import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';

import {NgDocOptionGroupComponent, NgDocOptionGroupHeaderDirective} from './option-group.component';

@NgModule({
	declarations: [NgDocOptionGroupComponent, NgDocOptionGroupHeaderDirective],
	imports: [CommonModule],
	exports: [NgDocOptionGroupComponent, NgDocOptionGroupHeaderDirective],
})
export class NgDocOptionGroupModule {}
