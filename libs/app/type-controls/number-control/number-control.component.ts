import {ChangeDetectionStrategy, Component} from '@angular/core';
import {NgDocTypeControl} from '@ng-doc/app/interfaces';
import {EMPTY_FUNCTION, extractValue} from '@ng-doc/core';

@Component({
	selector: 'ng-doc-number-control',
	templateUrl: './number-control.component.html',
	styleUrls: ['./number-control.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocNumberControlComponent implements NgDocTypeControl {
	model: number | null | undefined = null;
	onChange: (value: number) => void = EMPTY_FUNCTION;

	registerOnChange(fn: (value: string) => void): void {
		this.onChange = (v: number) => fn(`${v}`);
	}

	writeValue(value: string): void {
		this.model = Number(extractValue(value));
	}
}
