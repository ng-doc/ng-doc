import {NgIf} from '@angular/common';
import {ChangeDetectionStrategy, Component} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {NgDocTypeControl} from '@ng-doc/app/interfaces';
import {extractValue} from '@ng-doc/core/helpers/extract-value';
import {
	NgDocButtonIconComponent,
	NgDocFocusableDirective,
	NgDocIconComponent,
	NgDocInputNumberDirective,
	NgDocInputWrapperComponent,
} from '@ng-doc/ui-kit';
import {FlControl, FlControlSilencerModule} from 'flex-controls';

@Component({
	selector: 'ng-doc-number-control',
	templateUrl: './number-control.component.html',
	styleUrls: ['./number-control.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
	imports: [
		NgDocInputWrapperComponent,
		FlControlSilencerModule,
		NgDocInputNumberDirective,
		FormsModule,
		NgIf,
		NgDocButtonIconComponent,
		NgDocFocusableDirective,
		NgDocIconComponent,
	],
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
