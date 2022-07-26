import {Component} from '@angular/core';
import {NgDocTypeControl} from '@ng-doc/app/interfaces';
import {extractValue} from '@ng-doc/core';
import {FlControl} from 'flex-controls';

@Component({
	selector: 'ng-doc-type-alias-control',
	templateUrl: './type-alias-control.component.html',
	styleUrls: ['./type-alias-control.component.scss'],
})
export class NgDocTypeAliasControlComponent<T> extends FlControl<T> implements NgDocTypeControl {
	default?: string;
	options?: string[];

	constructor() {
		super();
	}

	get defaultValue(): T | null {
		return this.default ? (extractValue(this.default) as unknown as T) : null;
	}

	typeOf(value: unknown): string {
		return typeof value;
	}

	changeModel(value: T | null): void {
		this.updateModel(value === null && this.default ? this.defaultValue : value);
	}
}
