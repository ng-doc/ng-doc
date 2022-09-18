import {ChangeDetectionStrategy, Component, Inject} from '@angular/core';
import {NgDocApiDisplayer, NgDocApiDisplayerContext} from '@ng-doc/app/interfaces';
import {NgDocExportedFunction} from '@ng-doc/core';
import {NG_DOC_COMPONENT_CONTEXT} from '@ng-doc/ui-kit';

@Component({
	selector: 'ng-doc-api-function',
	templateUrl: './api-function.component.html',
	styleUrls: ['./api-function.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocApiFunctionComponent implements NgDocApiDisplayer<NgDocExportedFunction> {
	constructor(
		@Inject(NG_DOC_COMPONENT_CONTEXT)
		private readonly context: NgDocApiDisplayerContext<NgDocExportedFunction>,
	) {}

	get api(): NgDocExportedFunction {
		return this.context.api;
	}
}
