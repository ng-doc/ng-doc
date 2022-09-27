import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {NgDocExportedMethod, NgDocExportedMethodSignature} from '@ng-doc/core';

@Component({
	selector: 'ng-doc-api-methods',
	templateUrl: './api-methods.component.html',
	styleUrls: ['./api-methods.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocApiMethodsComponent {
	@Input()
	methods: NgDocExportedMethod[] | NgDocExportedMethodSignature[] = [];

	@Input()
	signature: boolean = false;

	readonly columns: string[] = ['tags', 'name', 'parameters', 'returnType', 'description'];
}
