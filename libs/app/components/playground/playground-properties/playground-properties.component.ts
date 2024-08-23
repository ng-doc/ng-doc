import { BreakpointObserver, Breakpoints, BreakpointState } from '@angular/cdk/layout';
import { AsyncPipe, KeyValuePipe, NgFor, NgIf } from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	EventEmitter,
	InjectionToken,
	Injector,
	Input,
	isDevMode,
	OnChanges,
	Output,
	SimpleChanges,
} from '@angular/core';
import { FormControl, FormGroup, FormsModule } from '@angular/forms';
import { isPlaygroundProperty } from '@ng-doc/app/helpers';
import { NgDocProvidedTypeControl } from '@ng-doc/app/interfaces';
import { getTokenForType } from '@ng-doc/app/providers/type-control';
import { extractValueOrThrow, isPresent, objectKeys } from '@ng-doc/core';
import {
	NgDocPlaygroundContent,
	NgDocPlaygroundProperties,
	NgDocPlaygroundProperty,
} from '@ng-doc/core/interfaces';
import {
	NgDocBindPipe,
	NgDocButtonComponent,
	NgDocCheckboxComponent,
	NgDocExecutePipe,
	NgDocIconComponent,
	NgDocTextComponent,
	NgDocTextRightDirective,
	NgDocTooltipDirective,
} from '@ng-doc/ui-kit';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { NgDocPlaygroundForm } from '../playground-form';
import { NgDocPlaygroundPropertyComponent } from '../playground-property/playground-property.component';
import { NgDocPlaygroundPropertyControl } from '../playground-property-control';

@Component({
	selector: 'ng-doc-playground-properties',
	templateUrl: './playground-properties.component.html',
	styleUrls: ['./playground-properties.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
	imports: [
		NgDocTextComponent,
		NgDocButtonComponent,
		NgDocCheckboxComponent,
		FormsModule,
		NgDocTooltipDirective,
		NgDocIconComponent,
		NgDocTextRightDirective,
		NgIf,
		NgFor,
		NgDocPlaygroundPropertyComponent,
		AsyncPipe,
		KeyValuePipe,
		NgDocBindPipe,
		NgDocExecutePipe,
	],
})
export class NgDocPlaygroundPropertiesComponent<
	P extends NgDocPlaygroundProperties,
	C extends Record<string, NgDocPlaygroundContent>,
> implements OnChanges
{
	@Input()
	form!: FormGroup<NgDocPlaygroundForm>;

	@Input()
	properties?: P;

	@Input()
	ignoreInputs?: string[] = [];

	@Input()
	dynamicContent?: C;

	@Input()
	defaultValues?: Record<string, unknown>;

	@Input()
	hideSidePanel: boolean = false;

	@Input()
	recreateDemo: boolean = false;

	@Input()
	showResetButton: boolean = false;

	@Output()
	recreateDemoChange: EventEmitter<boolean> = new EventEmitter<boolean>();

	@Output()
	resetForm: EventEmitter<void> = new EventEmitter<void>();

	readonly breakpoints: string[] = [Breakpoints.XSmall];
	readonly observer: Observable<boolean>;

	protected propertyControls: NgDocPlaygroundPropertyControl[] = [];
	protected contentTypeControl?: NgDocProvidedTypeControl = this.getControlForType('boolean');

	constructor(
		protected readonly breakpointObserver: BreakpointObserver,
		private injector: Injector,
	) {
		this.observer = this.breakpointObserver
			.observe(this.breakpoints)
			.pipe(map((state: BreakpointState) => state.matches));
	}

	ngOnChanges({ properties }: SimpleChanges): void {
		if (properties && this.properties) {
			this.propertyControls = objectKeys(this.properties)
				.filter((key: keyof P) => this.ignoreInputs?.includes(String(key)) !== true)
				.map((key: keyof P) => {
					if (this.properties) {
						const property: NgDocPlaygroundProperty = this.properties[key];
						const typeControl: NgDocProvidedTypeControl | undefined = this.getTypeControl(property);

						if (typeControl) {
							return {
								propertyName: String(key),
								property,
								typeControl,
							};
						}
					}

					return null;
				})
				.filter(isPresent)
				.sort((a: NgDocPlaygroundPropertyControl, b: NgDocPlaygroundPropertyControl) => {
					const aOrder: number | undefined = a.typeControl.options?.order;
					const bOrder: number | undefined = b.typeControl.options?.order;

					if (isPresent(aOrder) && isPresent(bOrder)) {
						return aOrder - bOrder;
					}
					if (isPresent(aOrder)) {
						return -1;
					}
					if (isPresent(bOrder)) {
						return 1;
					}
					return a.property.inputName.localeCompare(b.property.inputName);
				});
		}
	}

	getFormControl(controlType: keyof typeof this.form.controls, key: string): FormControl {
		return this.form.get(controlType)?.get(key) as FormControl;
	}

	private getTypeControl(property: NgDocPlaygroundProperty): NgDocProvidedTypeControl | undefined {
		const type: string = property.type;
		const typeControl: NgDocProvidedTypeControl | undefined =
			this.getControlForType(type) ??
			this.getControlForTypeAlias(
				isPlaygroundProperty(property) ? property.options : undefined,
				property.isManual,
			);

		if (!typeControl && isDevMode()) {
			console.warn(
				`NgDocPlayground didn't find the control for the @Input "${property.inputName}", the type "${type}" was not recognized'`,
			);
		}

		return typeControl;
	}

	private getControlForType(type: string): NgDocProvidedTypeControl | undefined {
		const token: InjectionToken<NgDocProvidedTypeControl> | undefined = getTokenForType(type);

		return token ? this.injector.get(token) : undefined;
	}

	private getControlForTypeAlias(
		options?: string[],
		isManual?: boolean,
	): NgDocProvidedTypeControl | undefined {
		if (options && options.length) {
			let optionsIsValid: boolean = true;

			if (!isManual) {
				try {
					// checking that all values are extractable
					options.forEach((item: string) => extractValueOrThrow(item));
				} catch {
					optionsIsValid = false;
				}
			}

			if (optionsIsValid) {
				const token: InjectionToken<NgDocProvidedTypeControl> | undefined =
					getTokenForType('NgDocTypeAlias');

				return token ? this.injector.get(token) : undefined;
			}
		}

		return undefined;
	}
}
