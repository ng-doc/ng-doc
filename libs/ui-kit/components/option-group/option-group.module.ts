import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocTextModule} from '@ng-doc/ui-kit/components/text';

import {NgDocOptionGroupComponent, NgDocOptionGroupHeaderDirective} from './option-group.component';

@NgModule({
	declarations: [NgDocOptionGroupComponent, NgDocOptionGroupHeaderDirective],
	imports: [CommonModule, NgDocTextModule],
	exports: [NgDocOptionGroupComponent, NgDocOptionGroupHeaderDirective],
})
export class NgDocOptionGroupModule {}
