import {ChangeDetectionStrategy, Component} from '@angular/core';
import {NgDocTypeControl} from '@ng-doc/app/interfaces';
import {FL_CONTROL_HOST, FlControlHost} from 'flex-controls';

@Component({
	selector: 'ng-doc-boolean-control',
	templateUrl: './boolean-control.component.html',
	styleUrls: ['./boolean-control.component.scss'],
	providers: [{provide: FL_CONTROL_HOST, useExisting: NgDocBooleanControlComponent}],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocBooleanControlComponent extends FlControlHost<string | undefined> implements NgDocTypeControl {
	constructor() {
		super();
	}
}
