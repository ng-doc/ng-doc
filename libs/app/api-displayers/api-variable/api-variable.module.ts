import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {provideApiDisplayer} from '@ng-doc/app/helpers';

import {NgDocApiVariableComponent} from './api-variable.component';
import {NgDocCodeModule} from '@ng-doc/app/components';

@NgModule({
	declarations: [NgDocApiVariableComponent],
	imports: [CommonModule, NgDocCodeModule],
	providers: [provideApiDisplayer('Variable', NgDocApiVariableComponent)],
})
export class NgDocApiVariableModule {}
