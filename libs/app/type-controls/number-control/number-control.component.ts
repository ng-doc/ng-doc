import {NgIf} from '@angular/common';
import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {NgDocTypeControl} from '@ng-doc/app/interfaces';
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
export class NgDocNumberControlComponent extends FlControl<number> implements NgDocTypeControl<number> {
	@Input()
	default?: number;

	constructor() {
		super();
	}

	changeModel(value: number | null): void {
		this.updateModel(value === null && this.default ? this.default : value);
	}
}
