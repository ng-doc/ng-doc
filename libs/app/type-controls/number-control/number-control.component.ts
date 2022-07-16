import {ChangeDetectionStrategy, ChangeDetectorRef, Component} from '@angular/core';
import {NgDocTypeControl} from '@ng-doc/app/interfaces';
import {extractValue, isPresent} from '@ng-doc/core';
import {FL_CONTROL_HOST, FlControlHost} from 'flex-controls';

@Component({
	selector: 'ng-doc-number-control',
	templateUrl: './number-control.component.html',
	styleUrls: ['./number-control.component.scss'],
	providers: [{provide: FL_CONTROL_HOST, useExisting: NgDocNumberControlComponent}],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocNumberControlComponent extends FlControlHost<string | undefined> implements NgDocTypeControl {
	constructor(protected override changeDetectorRef: ChangeDetectorRef) {
		super(changeDetectorRef);
	}

	override registerOnChange(fn: (value: string) => void): void {
		super.registerOnChange((v: string | null | undefined) => fn(String(v)));
	}

	override writeValue(value: string | null): void {
		const extractedValue: string | number | boolean | null | undefined = extractValue(String(value));

		super.writeValue(isPresent(extractedValue) ? String(extractedValue) : extractedValue);
	}
}
