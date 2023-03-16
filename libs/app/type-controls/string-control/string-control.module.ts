import {CommonModule} from '@angular/common';
import {NgModule, Provider} from '@angular/core';
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

const provider: Provider = provideTypeControl('string', NgDocStringControlComponent);

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
	providers: [provider],
	exports: [NgDocStringControlComponent],
})
export class NgDocStringControlModule {}
