import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {provideTypeControl} from '@ng-doc/app/helpers';
import {NgDocClearControlModule, NgDocInputNumberModule, NgDocInputWrapperModule} from '@ng-doc/ui-kit';

import {NgDocNumberControlComponent} from './number-control.component';

@NgModule({
	declarations: [NgDocNumberControlComponent],
	imports: [CommonModule, NgDocInputWrapperModule, NgDocInputNumberModule, NgDocClearControlModule, FormsModule],
	providers: [provideTypeControl<number>('number', NgDocNumberControlComponent)],
	exports: [NgDocNumberControlComponent],
})
export class NgDocNumberControlModule {}
