import {ChangeDetectionStrategy, Component, ContentChild, Input, TemplateRef} from '@angular/core';
import {NgDocDataDirective} from '@ng-doc/ui-kit/directives/data';
import {FL_CONTROL_HOST, FlControlHost} from 'flex-controls';

@Component({
	selector: 'ng-doc-combobox',
	templateUrl: './combobox.component.html',
	styleUrls: ['./combobox.component.scss'],
	providers: [
		{
			provide: FL_CONTROL_HOST,
			useExisting: NgDocComboboxComponent,
		},
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocComboboxComponent<T> extends FlControlHost<T> {
	@Input()
	readonly: boolean = false;

	@ContentChild(NgDocDataDirective, {read: TemplateRef})
	data: TemplateRef<never> | null = null;

	constructor() {
		super();
	}
}
