import {ChangeDetectionStrategy, Component} from '@angular/core';
import {NgDocTypeControl} from '@ng-doc/app/interfaces';
import {NgDocCheckboxComponent, NgDocTooltipDirective} from '@ng-doc/ui-kit';
import {FlControlHost, provideControlHost} from 'flex-controls';

@Component({
	selector: 'ng-doc-boolean-control',
	templateUrl: './boolean-control.component.html',
	styleUrls: ['./boolean-control.component.scss'],
	providers: [provideControlHost(NgDocBooleanControlComponent)],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
	imports: [NgDocCheckboxComponent, NgDocTooltipDirective],
})
export class NgDocBooleanControlComponent extends FlControlHost<string | undefined> implements NgDocTypeControl {
	name: string = '';
	description: string = '';

	constructor() {
		super();

		this.controlChange.subscribe(() => this.onTouched());
	}
}
