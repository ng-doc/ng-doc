import {CommonModule} from '@angular/common';
import {NgModule, Provider} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {provideTypeControl} from '@ng-doc/app/helpers';
import {FlControlSilencerModule} from 'flex-controls';

import {NgDocNumberControlComponent} from './number-control.component';

const provider: Provider = provideTypeControl('number', NgDocNumberControlComponent, {order: 30});

@NgModule({
	imports: [CommonModule, FormsModule, FlControlSilencerModule, NgDocNumberControlComponent],
	providers: [provider],
	exports: [NgDocNumberControlComponent],
})
export class NgDocNumberControlModule {}
