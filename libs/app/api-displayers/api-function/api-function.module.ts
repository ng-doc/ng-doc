import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {provideApiDisplayer} from '@ng-doc/app/helpers';

import {NgDocApiFunctionComponent} from './api-function.component';

@NgModule({
	declarations: [NgDocApiFunctionComponent],
	imports: [CommonModule],
	providers: [provideApiDisplayer('Function', NgDocApiFunctionComponent)],
})
export class NgDocApiFunctionModule {}
