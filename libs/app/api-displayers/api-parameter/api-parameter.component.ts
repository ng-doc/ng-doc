import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {NgDocExportedParameter} from '@ng-doc/core';

@Component({
	selector: 'ng-doc-api-parameter',
	templateUrl: './api-parameter.component.html',
	styleUrls: ['./api-parameter.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocApiParameterComponent {
	@Input()
	parameter?: NgDocExportedParameter;
}
