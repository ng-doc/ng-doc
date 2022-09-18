import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocCodeModule} from '@ng-doc/app/components';
import {provideApiDisplayer} from '@ng-doc/app/helpers';

import {NgDocApiTypeAliasComponent} from './api-type-alias.component';

@NgModule({
	declarations: [NgDocApiTypeAliasComponent],
	imports: [CommonModule, NgDocCodeModule],
	providers: [provideApiDisplayer('TypeAlias', NgDocApiTypeAliasComponent)],
})
export class NgDocApiTypeAliasModule {}
