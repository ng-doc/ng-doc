import {ChangeDetectionStrategy, Component} from '@angular/core';
import {NgDocTypeControl} from '@ng-doc/app/interfaces';
import {extractValue, NgDocExtractedValue} from '@ng-doc/core';
import {FlControl} from 'flex-controls';

@Component({
	selector: 'ng-doc-string-control',
	templateUrl: './string-control.component.html',
	styleUrls: ['./string-control.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocStringControlComponent extends FlControl<string> implements NgDocTypeControl {
	default?: string;

	constructor() {
		super();
	}

	get defaultValue(): NgDocExtractedValue {
		return this.default ? extractValue(this.default) : null;
	}

	changeModel(value: string | null): void {
		this.updateModel(value === null && this.default ? String(this.defaultValue) : value);
	}
}
