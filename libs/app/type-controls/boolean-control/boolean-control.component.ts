import {ChangeDetectionStrategy, Component} from '@angular/core';
import {NgDocTypeControl} from '@ng-doc/app/interfaces';
import {NgDocSanitizeHtmlPipe} from '@ng-doc/app/pipes';
import {NgDocCheckboxComponent, NgDocTooltipDirective} from '@ng-doc/ui-kit';
import {FlControlHost, provideControlHost} from 'flex-controls';

@Component({
	selector: 'ng-doc-boolean-control',
	templateUrl: './boolean-control.component.html',
	styleUrls: ['./boolean-control.component.scss'],
	providers: [provideControlHost(NgDocBooleanControlComponent)],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
	imports: [NgDocCheckboxComponent, NgDocTooltipDirective, NgDocSanitizeHtmlPipe],
})
export class NgDocBooleanControlComponent
	extends FlControlHost<boolean | undefined>
	implements NgDocTypeControl<boolean | undefined>
{
	default?: boolean;

	name: string = '';
	description: string = '';

	constructor() {
		super();

		this.controlChange.subscribe(() => this.onTouched());
	}

	get defaultValue(): boolean | undefined {
		return Object.prototype.hasOwnProperty.call(this, 'default') ? this.default : false;
	}

	override updateModel(obj: boolean | null | undefined) {
		super.updateModel(obj ? obj : !this.defaultValue ? this.defaultValue : false);
	}
}
