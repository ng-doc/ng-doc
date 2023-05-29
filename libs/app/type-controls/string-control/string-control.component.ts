import {NgIf} from '@angular/common';
import {ChangeDetectionStrategy, Component} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {NgDocTypeControl} from '@ng-doc/app/interfaces';
import {extractValue} from '@ng-doc/core/helpers/extract-value';
import {
	NgDocButtonIconComponent,
	NgDocFocusableDirective,
	NgDocIconComponent,
	NgDocInputStringDirective,
	NgDocInputWrapperComponent,
} from '@ng-doc/ui-kit';
import {FlControl, FlControlSilencerModule} from 'flex-controls';

@Component({
	selector: 'ng-doc-string-control',
	templateUrl: './string-control.component.html',
	styleUrls: ['./string-control.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
	imports: [
		NgDocInputWrapperComponent,
		FlControlSilencerModule,
		NgDocInputStringDirective,
		FormsModule,
		NgIf,
		NgDocButtonIconComponent,
		NgDocFocusableDirective,
		NgDocIconComponent,
	],
})
export class NgDocStringControlComponent extends FlControl<string> implements NgDocTypeControl {
	default?: string;

	constructor() {
		super();
	}

	get defaultValue(): string | null {
		return this.default ? (extractValue(this.default) as string) : null;
	}

	changeModel(value: string | null): void {
		this.updateModel(value === null && this.default ? this.defaultValue : value);
	}
}
