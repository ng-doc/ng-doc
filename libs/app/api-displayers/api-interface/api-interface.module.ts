import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {provideApiDisplayer} from '@ng-doc/app/helpers';

import {NgDocApiInterfaceComponent} from './api-interface.component';

@NgModule({
	declarations: [NgDocApiInterfaceComponent],
	imports: [CommonModule],
	providers: [provideApiDisplayer('Interface', NgDocApiInterfaceComponent)],
})
export class NgDocApiInterfaceModule {}
