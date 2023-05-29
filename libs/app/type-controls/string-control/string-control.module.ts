import {CommonModule} from '@angular/common';
import {NgModule, Provider} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {provideTypeControl} from '@ng-doc/app/helpers';
import {FlControlSilencerModule} from 'flex-controls';

import {NgDocStringControlComponent} from './string-control.component';

const provider: Provider = provideTypeControl('string', NgDocStringControlComponent, {order: 20});

@NgModule({
    imports: [
    CommonModule,
    FormsModule,
    FlControlSilencerModule,
    NgDocStringControlComponent,
],
    providers: [provider],
    exports: [NgDocStringControlComponent],
})
export class NgDocStringControlModule {}
