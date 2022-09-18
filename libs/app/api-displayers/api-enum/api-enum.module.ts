import {CdkTableModule} from '@angular/cdk/table';
import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocKindIconModule} from '@ng-doc/app/components';
import {provideApiDisplayer} from '@ng-doc/app/helpers';
import {NgDocTextModule, NgDocTooltipModule} from '@ng-doc/ui-kit';

import {NgDocApiEnumComponent} from './api-enum.component';

@NgModule({
	declarations: [NgDocApiEnumComponent],
	imports: [CommonModule, CdkTableModule, NgDocKindIconModule, NgDocTextModule, NgDocTooltipModule],
	providers: [provideApiDisplayer('Enum', NgDocApiEnumComponent)],
})
export class NgDocApiEnumModule {}
