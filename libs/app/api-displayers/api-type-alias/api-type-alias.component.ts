import {ChangeDetectionStrategy, Component, Inject} from '@angular/core';
import {NgDocApiDisplayer, NgDocApiDisplayerContext} from '@ng-doc/app/interfaces';
import {NgDocExportedTypeAlias} from '@ng-doc/core';
import {NG_DOC_COMPONENT_CONTEXT} from '@ng-doc/ui-kit';

@Component({
	selector: 'ng-doc-api-code-presentation',
	templateUrl: './api-type-alias.component.html',
	styleUrls: ['./api-type-alias.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocApiTypeAliasComponent implements NgDocApiDisplayer<NgDocExportedTypeAlias> {
	constructor(
		@Inject(NG_DOC_COMPONENT_CONTEXT)
		private readonly context: NgDocApiDisplayerContext<NgDocExportedTypeAlias>,
	) {}

	get api(): NgDocExportedTypeAlias {
		return this.context.api;
	}
}
