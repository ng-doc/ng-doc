import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {provideTypeControl} from '@ng-doc/app/helpers';
import {NgDocExtractValueModule} from '@ng-doc/app/pipes/extract-value';
import {
	NgDocButtonIconModule,
	NgDocClearControlModule,
	NgDocFocusableModule,
	NgDocIconModule,
	NgDocInputStringModule,
	NgDocInputWrapperModule,
} from '@ng-doc/ui-kit';
import {FlControlSilencerModule} from 'flex-controls';

import {NgDocStringControlComponent} from './string-control.component';

@NgModule({
	declarations: [NgDocStringControlComponent],
	imports: [
		CommonModule,
		NgDocInputWrapperModule,
		NgDocInputStringModule,
		NgDocClearControlModule,
		FormsModule,
		FlControlSilencerModule,
		NgDocExtractValueModule,
		NgDocIconModule,
		NgDocButtonIconModule,
		NgDocFocusableModule,
	],
	providers: [provideTypeControl('string', NgDocStringControlComponent)],
	exports: [NgDocStringControlComponent],
})
export class NgDocStringControlModule {}
