import {ChangeDetectionStrategy, Component, Inject} from '@angular/core';
import {NgDocApiDisplayer, NgDocApiDisplayerContext} from '@ng-doc/app/interfaces';
import {NgDocExportedVariable} from '@ng-doc/core';
import {NG_DOC_COMPONENT_CONTEXT} from '@ng-doc/ui-kit';

@Component({
	selector: 'ng-doc-api-variable',
	templateUrl: './api-variable.component.html',
	styleUrls: ['./api-variable.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocApiVariableComponent implements NgDocApiDisplayer<NgDocExportedVariable> {
	constructor(
		@Inject(NG_DOC_COMPONENT_CONTEXT)
		private readonly context: NgDocApiDisplayerContext<NgDocExportedVariable>,
	) {}

	get api(): NgDocExportedVariable {
		return this.context.api;
	}

	get code(): string {
		return `${this.api.declarationKind} ${this.api.name}: ${this.api.type};`;
	}
}
