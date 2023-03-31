import {BreakpointObserver, Breakpoints} from '@angular/cdk/layout';
import {ChangeDetectionStrategy, Component, EventEmitter, Input, Output} from '@angular/core';
import {FormControl, FormGroup} from '@angular/forms';
import {NgDocPlaygroundContent, NgDocPlaygroundProperties} from '@ng-doc/core/interfaces';
import {Observable} from 'rxjs';
import {pluck} from 'rxjs/operators';

import {NgDocPlaygroundForm} from '../playground-form';

@Component({
	selector: 'ng-doc-playground-properties',
	templateUrl: './playground-properties.component.html',
	styleUrls: ['./playground-properties.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocPlaygroundPropertiesComponent<
	P extends NgDocPlaygroundProperties,
	C extends Record<string, NgDocPlaygroundContent>,
> {
	@Input()
	form!: FormGroup<NgDocPlaygroundForm>;

	@Input()
	properties?: P;

	@Input()
	dynamicContent?: C;

	@Input()
	recreateDemo: boolean = false;

	@Output()
	recreateDemoChange: EventEmitter<boolean> = new EventEmitter<boolean>();

	@Output()
	resetForm: EventEmitter<void> = new EventEmitter<void>();

	readonly breakpoints: string[] = [Breakpoints.XSmall];
	readonly observer: Observable<boolean>;

	constructor(protected readonly breakpointObserver: BreakpointObserver) {
		this.observer = this.breakpointObserver.observe(this.breakpoints).pipe(pluck('matches'));
	}

	getFormControl(controlType: keyof typeof this.form.controls, key: string): FormControl {
		return this.form.get(controlType)?.get(key) as FormControl;
	}
}
