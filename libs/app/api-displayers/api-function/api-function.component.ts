import {ChangeDetectionStrategy, Component, Inject} from '@angular/core';
import {NgDocApiDisplayer, NgDocApiDisplayerContext} from '@ng-doc/app/interfaces';
import {NgDocExportedFunction, NgDocExportedParameter} from '@ng-doc/core';
import {NG_DOC_COMPONENT_CONTEXT} from '@ng-doc/ui-kit';

@Component({
	selector: 'ng-doc-api-function',
	templateUrl: './api-function.component.html',
	styleUrls: ['./api-function.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocApiFunctionComponent implements NgDocApiDisplayer<NgDocExportedFunction> {
	readonly columns: string[] = ['tags', 'name', 'type', 'description'];

	constructor(
		@Inject(NG_DOC_COMPONENT_CONTEXT)
		private readonly context: NgDocApiDisplayerContext<NgDocExportedFunction>,
	) {}

	get api(): NgDocExportedFunction {
		return this.context.api;
	}

	get presentation(): string {
		const parameters: string = this.api.parameters.map(this.parameterPresentation).join(', ');

		return `function ${this.api.name}(${parameters}): ${this.api.returnType};`;
	}

	private parameterPresentation(parameter: NgDocExportedParameter): string {
		return `${parameter.decorators.join(' ')} ${parameter.name}${parameter.hasQuestionToken ? '?' : ''}: ${
			parameter.type
		}${parameter.initializer ? ` = ${parameter.initializer}` : ''}`.trim();
	}
}
