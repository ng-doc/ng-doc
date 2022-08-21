import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {NgDocExportedType} from '@ng-doc/core';

@Component({
	selector: 'ng-doc-api-type',
	templateUrl: './api-type.component.html',
	styleUrls: ['./api-type.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocApiTypeComponent {
	@Input()
	type?: NgDocExportedType;

	@Input()
	wrap: boolean = true;
}
