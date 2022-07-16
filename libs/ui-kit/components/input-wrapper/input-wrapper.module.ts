import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocFloatedBorderModule} from '@ng-doc/ui-kit/components/floated-border';
import {NgDocFloatedContentModule} from '@ng-doc/ui-kit/components/floated-content';
import {NgDocWrapperModule} from '@ng-doc/ui-kit/components/wrapper';
import {NgDocFocusCatcherModule} from '@ng-doc/ui-kit/directives/focus-catcher';
import {NgDocFocusableModule} from '@ng-doc/ui-kit/directives/focusable';
import {PolymorpheusModule} from '@tinkoff/ng-polymorpheus';

import {NgDocInputWrapperComponent} from './input-wrapper.component';

@NgModule({
	declarations: [NgDocInputWrapperComponent],
	imports: [
		CommonModule,
		PolymorpheusModule,
		NgDocWrapperModule,
		NgDocFocusCatcherModule,
		NgDocFloatedBorderModule,
		NgDocFloatedContentModule,
		NgDocFocusableModule,
	],
	exports: [NgDocInputWrapperComponent],
})
export class NgDocInputWrapperModule {}
