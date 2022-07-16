import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {FormControl, FormGroup} from '@angular/forms';
import {NgDocPlaygroundProperties} from '@ng-doc/builder';

@Component({
	selector: 'ng-doc-playground-properties',
	templateUrl: './playground-properties.component.html',
	styleUrls: ['./playground-properties.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocPlaygroundPropertiesComponent<T extends NgDocPlaygroundProperties = NgDocPlaygroundProperties> {
	@Input()
	form?: FormGroup<Record<keyof T, FormControl>>;

	@Input()
	properties?: T;

	getFormControl(key: string): FormControl {
		return this.form?.get(key) as FormControl
	}
}
