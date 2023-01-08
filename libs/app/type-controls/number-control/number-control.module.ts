import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {provideTypeControl} from '@ng-doc/app/helpers';
import {
	NgDocButtonIconModule,
	NgDocClearControlModule,
	NgDocFocusableModule,
	NgDocIconModule,
	NgDocInputNumberModule,
	NgDocInputWrapperModule,
} from '@ng-doc/ui-kit';
import {FlControlSilencerModule} from 'flex-controls';

import {NgDocNumberControlComponent} from './number-control.component';

@NgModule({
	declarations: [NgDocNumberControlComponent],
	imports: [
		CommonModule,
		NgDocInputWrapperModule,
		NgDocInputNumberModule,
		NgDocClearControlModule,
		FormsModule,
		FlControlSilencerModule,
		NgDocButtonIconModule,
		NgDocFocusableModule,
		NgDocIconModule,
	],
	providers: [provideTypeControl('number', NgDocNumberControlComponent)],
	exports: [NgDocNumberControlComponent],
})
export class NgDocNumberControlModule {}