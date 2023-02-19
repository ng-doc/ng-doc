import {ChangeDetectionStrategy, Component} from '@angular/core';
import {FormControl, FormGroup} from '@angular/forms';
import {NgDocTypeControl} from '@ng-doc/app';
import {EMPTY_FUNCTION} from '@ng-doc/core';
import {UntilDestroy, untilDestroyed} from '@ngneat/until-destroy';

import {FloatingCirclePosition} from '../floating-circle/floating-circle.component';

@Component({
	selector: 'ng-doc-floating-circle-position-control',
	templateUrl: './floating-circle-position-control.component.html',
	styleUrls: ['./floating-circle-position-control.component.css'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
@UntilDestroy()
export class FloatingCirclePositionControlComponent implements NgDocTypeControl {
	model: FormGroup<{
		top: FormControl<string | null>;
		left: FormControl<string | null>;
	}> = new FormGroup({
		top: new FormControl<string>(''),
		left: new FormControl<string>(''),
	});

	touched: () => void = EMPTY_FUNCTION;
	changed: (value: FloatingCirclePosition | null) => void = EMPTY_FUNCTION;

	constructor() {
		this.model.valueChanges
			.pipe(untilDestroyed(this))
			.subscribe((value: FloatingCirclePosition) => this.changed(value));
	}

	registerOnChange(fn: (value: FloatingCirclePosition | null) => void): void {
		this.changed = fn;
	}

	registerOnTouched(fn: () => void): void {
		this.touched = fn;
	}

	writeValue(obj: FloatingCirclePosition | null): void {
		this.model.patchValue(
			{
				top: null,
				left: null,
				...(obj ? obj : {}),
			},
			{emitEvent: false},
		);
	}
}
