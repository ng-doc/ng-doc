import {ChangeDetectionStrategy, Component, OnInit} from '@angular/core';
import {FormBuilder, FormControl, FormGroup} from '@angular/forms';
import {NgDocRootPage} from '@ng-doc/app/classes/root-page';
import {
	extractValue,
	NgDocExtractedValue,
	NgDocPlaygroundConfig,
	NgDocPlaygroundProperties,
	objectKeys,
} from '@ng-doc/core';

export interface NgDocPlaygroundForm {
	properties: FormGroup<Record<string, FormControl<NgDocExtractedValue>>>;
	content: FormGroup<Record<string, FormControl<boolean>>>;
}

@Component({
	selector: 'ng-doc-playground',
	templateUrl: './playground.component.html',
	styleUrls: ['./playground.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocPlaygroundComponent<T extends NgDocPlaygroundProperties = NgDocPlaygroundProperties>
	implements OnInit
{
	id: string = '';
	selectors: string[] = [];
	properties?: T;
	formGroup!: FormGroup<NgDocPlaygroundForm>;
	recreateDemo: boolean = false;

	constructor(private readonly rootPage: NgDocRootPage, private readonly formBuilder: FormBuilder) {}

	ngOnInit(): void {
		const propertiesForm: FormGroup = this.formBuilder.group(this.getPropertiesFormValues());
		const contentForm: FormGroup = this.formBuilder.group(this.getContentFormValues());

		this.formGroup = this.formBuilder.group({
			properties: propertiesForm,
			content: contentForm,
		});
	}

	get configuration(): NgDocPlaygroundConfig | undefined {
		return this.rootPage.dependencies?.playgrounds?.[this.id];
	}

	private getPropertiesFormValues<K extends keyof T>(): Record<K, NgDocExtractedValue> {
		return objectKeys(this.properties ?? {}).reduce((controls: Record<K, NgDocExtractedValue>, key: K) => {
			if (this.properties) {
				controls[key] = extractValue(this.properties[key]?.default ?? 'undefined');
			}

			return controls;
		}, {} as Record<K, NgDocExtractedValue>);
	}

	private getContentFormValues(): Record<string, boolean> {
		return objectKeys(this.configuration?.content ?? {}).reduce(
			(controls: Record<string, boolean>, key: string) => {
				if (this.configuration?.content) {
					controls[key] = false;
				}

				return controls;
			},
			{} as Record<keyof T, boolean>,
		);
		return {};
	}

	resetForm(): void {
		this.formGroup?.reset({
			properties: this.getPropertiesFormValues(),
			content: this.getContentFormValues(),
		});
	}
}
