import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {provideApiDisplayer} from '@ng-doc/app/helpers';

import {NgDocApiVariableComponent} from './api-variable.component';

@NgModule({
	declarations: [NgDocApiVariableComponent],
	imports: [CommonModule],
	providers: [provideApiDisplayer('Variable', NgDocApiVariableComponent)],
})
export class NgDocApiVariableModule {}
