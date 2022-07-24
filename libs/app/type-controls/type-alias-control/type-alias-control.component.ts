import {Component} from '@angular/core';
import {NgDocTypeControl} from '@ng-doc/app/interfaces';
import {FL_CONTROL_HOST, FlControlHost} from 'flex-controls';

@Component({
	selector: 'ng-doc-type-alias-control',
	templateUrl: './type-alias-control.component.html',
	providers: [
		{
			provide: FL_CONTROL_HOST,
			useExisting: NgDocTypeAliasControlComponent,
		},
	],
	styleUrls: ['./type-alias-control.component.scss'],
})
export class NgDocTypeAliasControlComponent<T> extends FlControlHost<T> implements NgDocTypeControl {
	default?: string;
	options?: string[];

	constructor() {
		super();
	}

	typeOf(value: unknown): string {
		return typeof value;
	}
}
