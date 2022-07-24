import {ChangeDetectionStrategy, Component} from '@angular/core';
import {NgDocTypeControl} from '@ng-doc/app/interfaces';
import {FL_CONTROL_HOST, FlControlHost} from 'flex-controls';

@Component({
	selector: 'ng-doc-number-control',
	templateUrl: './number-control.component.html',
	styleUrls: ['./number-control.component.scss'],
	providers: [{provide: FL_CONTROL_HOST, useExisting: NgDocNumberControlComponent}],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocNumberControlComponent extends FlControlHost<string | undefined> implements NgDocTypeControl {
	constructor() {
		super();
	}
}
