import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocApiMethodsModule} from '@ng-doc/app/api-displayers/api-methods';
import {NgDocApiPropertiesModule} from '@ng-doc/app/api-displayers/api-properties';
import {provideApiDisplayer} from '@ng-doc/app/helpers';

import {NgDocApiInterfaceComponent} from './api-interface.component';

@NgModule({
	declarations: [NgDocApiInterfaceComponent],
	imports: [CommonModule, NgDocApiPropertiesModule, NgDocApiMethodsModule],
	providers: [provideApiDisplayer('Interface', NgDocApiInterfaceComponent)],
})
export class NgDocApiInterfaceModule {}
