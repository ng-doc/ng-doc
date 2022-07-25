import {ChangeDetectionStrategy, Component, EventEmitter, Input, Output} from '@angular/core';
import {FormControl, FormGroup} from '@angular/forms';
import {NgDocPlaygroundFormData} from '@ng-doc/app/interfaces';
import {NgDocPlaygroundDynamicContent, NgDocPlaygroundProperties} from '@ng-doc/builder';

@Component({
	selector: 'ng-doc-playground-properties',
	templateUrl: './playground-properties.component.html',
	styleUrls: ['./playground-properties.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocPlaygroundPropertiesComponent<
	P extends NgDocPlaygroundProperties,
	C extends Record<string, NgDocPlaygroundDynamicContent>,
> {
	@Input()
	form?: FormGroup;

	@Input()
	properties?: P;

	@Input()
	dynamicContent?: C;

	@Output()
	resetForm: EventEmitter<void> = new EventEmitter<void>();

	@Output()
	toggleReinitialize: EventEmitter<void> = new EventEmitter<void>();

	getFormControl(controlType: keyof NgDocPlaygroundFormData<P, C>, key: string): FormControl {
		return this.form?.get(controlType)?.get(key) as FormControl;
	}
}
