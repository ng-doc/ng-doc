import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {provideTypeControl} from '@ng-doc/app/helpers';
import {NgDocClearControlModule, NgDocInputStringModule, NgDocInputWrapperModule} from '@ng-doc/ui-kit';

import {NgDocStringControlComponent} from './string-control.component';

@NgModule({
	declarations: [NgDocStringControlComponent],
	imports: [CommonModule, NgDocInputWrapperModule, NgDocInputStringModule, NgDocClearControlModule],
	providers: [provideTypeControl<string>('string', NgDocStringControlComponent)],
	exports: [NgDocStringControlComponent],
})
export class NgDocStringControlModule {}
