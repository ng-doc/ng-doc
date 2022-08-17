import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {provideApiDisplayer} from '@ng-doc/app/helpers';
import {NgDocExportedDeclarationKind} from '@ng-doc/core';

import {NgDocApiClassComponent} from './api-class.component';

@NgModule({
	declarations: [NgDocApiClassComponent],
	imports: [CommonModule],
	providers: [provideApiDisplayer(NgDocExportedDeclarationKind.Class, NgDocApiClassComponent)],
})
export class NgDocApiClassModule {}
