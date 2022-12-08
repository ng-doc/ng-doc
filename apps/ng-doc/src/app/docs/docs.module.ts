import {NgModule} from '@angular/core';
import {CommonModule} from '@angular/common';
import {DocsComponent} from './docs.component';
import {RouterModule} from '@angular/router';
import {NG_DOC_ROUTING} from '@ng-doc/builder/generated';

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
