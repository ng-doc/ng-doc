import {NgFor, NgIf, NgTemplateOutlet} from '@angular/common';
import {ChangeDetectionStrategy, Component} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {NgDocKindIconComponent} from '@ng-doc/app/components/kind-icon';
import {NgDocTypeControl} from '@ng-doc/app/interfaces';
import {NgDocExtractValuePipe} from '@ng-doc/app/pipes/extract-value';
import {extractValue} from '@ng-doc/core/helpers/extract-value';
import {
	NgDocButtonIconComponent,
	NgDocComboboxComponent,
	NgDocDataDirective,
	NgDocFocusableDirective,
	NgDocIconComponent,
	NgDocListComponent,
	NgDocOptionComponent,
	NgDocTextComponent,
	NgDocTextLeftDirective,
	NgDocTextRightDirective,
	NgDocTooltipDirective,
} from '@ng-doc/ui-kit';
import {FlControl} from 'flex-controls';

@Component({
	selector: 'ng-doc-type-alias-control',
	templateUrl: './type-alias-control.component.html',
	styleUrls: ['./type-alias-control.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
	imports: [
		NgDocComboboxComponent,
		FormsModule,
		NgDocDataDirective,
		NgDocListComponent,
		NgFor,
		NgIf,
		NgDocOptionComponent,
		NgTemplateOutlet,
		NgDocTextComponent,
		NgDocKindIconComponent,
		NgDocTextLeftDirective,
		NgDocTooltipDirective,
		NgDocTextRightDirective,
		NgDocButtonIconComponent,
		NgDocFocusableDirective,
		NgDocIconComponent,
		NgDocExtractValuePipe,
	],
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
