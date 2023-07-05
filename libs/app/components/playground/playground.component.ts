import {NgFor, NgIf} from '@angular/common';
import {AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component} from '@angular/core';
import {FormBuilder, FormGroup} from '@angular/forms';
import {NgDocRootPage} from '@ng-doc/app/classes/root-page';
import {objectKeys} from '@ng-doc/core/helpers/object-keys';
import {NgDocPlaygroundConfig, NgDocPlaygroundProperties} from '@ng-doc/core/interfaces';
import {NgDocAsArrayPipe} from '@ng-doc/ui-kit';

import {NgDocPlaygroundDemoComponent} from './playground-demo/playground-demo.component';
import {NgDocPlaygroundForm} from './playground-form';
import {NgDocPlaygroundPropertiesComponent} from './playground-properties/playground-properties.component';

@Component({
	selector: 'ng-doc-playground',
	templateUrl: './playground.component.html',
	styleUrls: ['./playground.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
	imports: [NgIf, NgDocPlaygroundPropertiesComponent, NgFor, NgDocPlaygroundDemoComponent, NgDocAsArrayPipe],
})
export class NgDocPlaygroundComponent<T extends NgDocPlaygroundProperties = NgDocPlaygroundProperties>
	implements AfterViewInit
{
	id: string = '';
	pipeName: string = '';
	selectors: string[] = [];
	properties?: T;
	formGroup!: FormGroup<NgDocPlaygroundForm>;
	recreateDemo: boolean = false;
	defaultValues?: Record<string, unknown>;

	constructor(
		private readonly rootPage: NgDocRootPage,
		private readonly formBuilder: FormBuilder,
		private readonly changeDetectorRef: ChangeDetectorRef,
	) {}

	ngAfterViewInit(): void {
		const propertiesForm: FormGroup = this.formBuilder.group(this.getPropertiesFormValues());
		const contentForm: FormGroup = this.formBuilder.group(this.getContentFormValues());

		this.formGroup = this.formBuilder.group({
			properties: propertiesForm,
			content: contentForm,
		});
		// `patchValue` is needed to set `undefined` values, otherwise they will be ignored by the Angular form
		this.formGroup.patchValue({
			properties: this.getPropertiesFormValues(),
			content: this.getContentFormValues(),
		});

		this.changeDetectorRef.detectChanges();
	}

	get configuration(): NgDocPlaygroundConfig | undefined {
		return this.rootPage.page?.playgrounds?.[this.id];
	}

	private getPropertiesFormValues(): Record<string, unknown> {
		return objectKeys(this.properties ?? {}).reduce((controls: Record<string, unknown>, key: string) => {
			if (this.properties) {
				controls[key] = this.defaultValues ? this.defaultValues[key] : undefined;
			}

			return controls;
		}, {} as Record<string, unknown>);
	}

	private getContentFormValues(): Record<string, boolean> {
		return objectKeys(this.configuration?.content ?? {}).reduce((controls: Record<string, boolean>, key: string) => {
			if (this.configuration?.content) {
				controls[key] = false;
			}

			return controls;
		}, {} as Record<keyof T, boolean>);
		return {};
	}

	resetForm(): void {
		this.formGroup?.patchValue({
			properties: this.getPropertiesFormValues(),
			content: this.getContentFormValues(),
		});
	}
}
