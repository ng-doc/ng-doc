import {ChangeDetectionStrategy, Component, Inject} from '@angular/core';
import {NgDocApiDisplayer, NgDocApiDisplayerContext} from '@ng-doc/app/interfaces';
import {NgDocExportedInterface} from '@ng-doc/core';
import {NG_DOC_COMPONENT_CONTEXT} from '@ng-doc/ui-kit';

@Component({
	selector: 'ng-doc-api-interface',
	templateUrl: './api-interface.component.html',
	styleUrls: ['./api-interface.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocApiInterfaceComponent implements NgDocApiDisplayer<NgDocExportedInterface> {
	constructor(
		@Inject(NG_DOC_COMPONENT_CONTEXT)
		private readonly context: NgDocApiDisplayerContext<NgDocExportedInterface>,
	) {}

	get api(): NgDocExportedInterface {
		return this.context.api;
	}
}
