import {ChangeDetectionStrategy, Component} from '@angular/core';
import {NgDocTypeControl} from '@ng-doc/app/interfaces';
import {EMPTY_FUNCTION, extractValue} from '@ng-doc/core';

@Component({
	selector: 'ng-doc-string-control',
	templateUrl: './string-control.component.html',
	styleUrls: ['./string-control.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocStringControlComponent implements NgDocTypeControl {
	model: string | null | undefined = '';
	onChange: (value: string) => void = EMPTY_FUNCTION;

	registerOnChange(fn: (value: string) => void): void {
		this.onChange = (v: string) => fn(`'${v}'`);
	}

	writeValue(value: string): void {
		this.model = String(extractValue(value));
	}
}
