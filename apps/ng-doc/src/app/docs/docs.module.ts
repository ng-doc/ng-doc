import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';
import {NG_DOC_ROUTING} from '@ng-doc/generated';

import {DocsComponent} from './docs.component';

@NgModule({
	imports: [
		CommonModule,
		RouterModule.forChild([
			{
				path: '',
				children: NG_DOC_ROUTING,
			},
		]),
	],
	declarations: [DocsComponent],
	exports: [RouterModule],
})
export class DocsModule {}
