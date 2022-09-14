import {ChangeDetectionStrategy, Component, Inject} from '@angular/core';
import {NgDocApiDisplayer, NgDocApiDisplayerContext} from '@ng-doc/app/interfaces';
import {NgDocExportedEnum} from '@ng-doc/core';
import {NG_DOC_COMPONENT_CONTEXT} from '@ng-doc/ui-kit';

@Component({
	selector: 'ng-doc-api-enum',
	templateUrl: './api-enum.component.html',
	styleUrls: ['./api-enum.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocApiEnumComponent implements NgDocApiDisplayer<NgDocExportedEnum> {
	columns: string[] = ['name', 'value', 'description'];

	constructor(
		@Inject(NG_DOC_COMPONENT_CONTEXT)
		private readonly context: NgDocApiDisplayerContext<NgDocExportedEnum>,
	) {}

	get api(): NgDocExportedEnum {
		return this.context.api;
	}
}
