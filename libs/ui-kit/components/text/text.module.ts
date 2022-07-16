import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';

import {NgDocTextComponent} from './text.component';
import {NgDocTextLeftDirective} from './text-left.directive';
import {NgDocTextRightDirective} from './text-right.directive';

@NgModule({
	declarations: [NgDocTextComponent, NgDocTextLeftDirective, NgDocTextRightDirective],
	imports: [CommonModule],
	exports: [NgDocTextComponent, NgDocTextLeftDirective, NgDocTextRightDirective],
})
export class NgDocTextModule {}
