import {ChangeDetectionStrategy, Component} from '@angular/core';
import {NgDocTypeControl} from '@ng-doc/app/interfaces';
import {FL_CONTROL_HOST, FlControlHost} from 'flex-controls';

@Component({
	selector: 'ng-doc-string-control',
	templateUrl: './string-control.component.html',
	styleUrls: ['./string-control.component.scss'],
	providers: [{provide: FL_CONTROL_HOST, useExisting: NgDocStringControlComponent}],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocStringControlComponent extends FlControlHost<string | undefined> implements NgDocTypeControl {
	constructor() {
		super();
	}
}
