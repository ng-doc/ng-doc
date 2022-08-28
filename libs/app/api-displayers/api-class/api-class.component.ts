import {ChangeDetectionStrategy, Component, Inject} from '@angular/core';
import {NgDocApiDisplayer, NgDocApiDisplayerContext} from '@ng-doc/app/interfaces';
import {NgDocExportedClass} from '@ng-doc/core';
import {expandCollapseAnimation, NG_DOC_COMPONENT_CONTEXT} from '@ng-doc/ui-kit';

@Component({
	animations: [expandCollapseAnimation],
	selector: 'ng-doc-api-class',
	templateUrl: './api-class.component.html',
	styleUrls: ['./api-class.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocApiClassComponent implements NgDocApiDisplayer<NgDocExportedClass> {
	expanded: boolean = false;

	constructor(
		@Inject(NG_DOC_COMPONENT_CONTEXT)
		private readonly context: NgDocApiDisplayerContext<NgDocExportedClass>,
	) {}

	get api(): NgDocExportedClass {
		return this.context.api;
	}
}
