import {ChangeDetectionStrategy, Component, OnInit} from '@angular/core';
import {FormControl, FormGroup} from '@angular/forms';
import {NgDocRootPage} from '@ng-doc/app/classes';
import {NgDocPlaygroundConfig, NgDocPlaygroundProperties} from '@ng-doc/builder';
import {extractValue, objectKeys} from '@ng-doc/core';

@Component({
	selector: 'ng-doc-playground',
	templateUrl: './playground.component.html',
	styleUrls: ['./playground.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocPlaygroundComponent<T extends NgDocPlaygroundProperties = NgDocPlaygroundProperties>
	implements OnInit
{
	id?: string;
	properties?: T;
	formGroup?: FormGroup;

	constructor(private readonly rootPage: NgDocRootPage) {}

	ngOnInit(): void {
		const propertiesForm: FormGroup = new FormGroup<Record<keyof T, FormControl>>(
			objectKeys(this.properties).reduce((controls: Record<keyof T, FormControl>, key: keyof T) => {
				if (this.properties) {
					controls[key] = new FormControl(extractValue(this.properties[key]?.default ?? 'undefined'));
				}

				return controls;
			}, {} as Record<keyof T, FormControl>),
		);

		const contentForm: FormGroup = new FormGroup(
			objectKeys(this.configuration?.dynamicContent ?? {}).reduce(
				(controls: Record<string, FormControl>, key: string) => {
					if (this.configuration?.dynamicContent) {
						controls[key] = new FormControl(false);
					}

					return controls;
				},
				{} as Record<keyof T, FormControl>,
			),
		);

		this.formGroup = new FormGroup({
			properties: propertiesForm,
			content: contentForm,
		});

		console.log(this.rootPage.playground, this.id, this.properties);
	}

	get configuration(): NgDocPlaygroundConfig | undefined {
		return this.id && this.rootPage.playground ? this.rootPage.playground[this.id] : undefined;
	}
}
