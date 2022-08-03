import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocIconModule} from '@ng-doc/ui-kit/components/icon';

import {NgDocBlockquoteComponent} from './blockquote.component';

@NgModule({
	declarations: [NgDocBlockquoteComponent],
	imports: [CommonModule, NgDocIconModule],
	exports: [NgDocBlockquoteComponent],
})
export class NgDocBlockquoteModule {}
