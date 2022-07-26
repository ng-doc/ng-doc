import {ChangeDetectionStrategy, Component} from '@angular/core';
import {NgDocTypeControl} from '@ng-doc/app/interfaces';
import {extractValue} from '@ng-doc/core';
import {FlControl} from 'flex-controls';

@Component({
	selector: 'ng-doc-number-control',
	templateUrl: './number-control.component.html',
	styleUrls: ['./number-control.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocNumberControlComponent extends FlControl<number> implements NgDocTypeControl {
	default: string | undefined;

	constructor() {
		super();
	}

	get defaultValue(): number | null {
		return this.default ? (extractValue(this.default) as number) : null;
	}

	changeModel(value: number | null): void {
		this.updateModel(value === null && this.default ? this.defaultValue : value);
	}
}
