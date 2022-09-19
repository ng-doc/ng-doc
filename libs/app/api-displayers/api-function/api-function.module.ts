import {CdkTableModule} from '@angular/cdk/table';
import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocApiTypeModule} from '@ng-doc/app/api-displayers/api-type';
import {NgDocCodeModule} from '@ng-doc/app/components';
import {provideApiDisplayer} from '@ng-doc/app/helpers';

import {NgDocApiFunctionComponent} from './api-function.component';

@NgModule({
	declarations: [NgDocApiFunctionComponent],
	imports: [CommonModule, NgDocCodeModule, CdkTableModule, NgDocApiTypeModule],
	providers: [provideApiDisplayer('Function', NgDocApiFunctionComponent)],
})
export class NgDocApiFunctionModule {}
