import {BreakpointObserver, Breakpoints} from '@angular/cdk/layout';
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
import {FormControl, FormGroup} from '@angular/forms';
import {getTokenForType, isPlaygroundProperty} from '@ng-doc/app/helpers';
import {NgDocProvidedTypeControl} from '@ng-doc/app/interfaces';
import {extractValueOrThrow, isPresent, objectKeys} from '@ng-doc/core';
import {NgDocPlaygroundContent, NgDocPlaygroundProperties, NgDocPlaygroundProperty} from '@ng-doc/core/interfaces';
import {Observable} from 'rxjs';
import {pluck} from 'rxjs/operators';

import {NgDocPlaygroundForm} from '../playground-form';
import {NgDocPlaygroundPropertyControl} from '../playground-property-control';

@Component({
	selector: 'ng-doc-playground-properties',
	templateUrl: './playground-properties.component.html',
	styleUrls: ['./playground-properties.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
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
	dynamicContent?: C;

	@Input()
	recreateDemo: boolean = false;

	@Output()
	recreateDemoChange: EventEmitter<boolean> = new EventEmitter<boolean>();

	@Output()
	resetForm: EventEmitter<void> = new EventEmitter<void>();

	readonly breakpoints: string[] = [Breakpoints.XSmall];
	readonly observer: Observable<boolean>;

	protected propertyControls: NgDocPlaygroundPropertyControl[] = [];
	protected contentTypeControl?: NgDocProvidedTypeControl = this.getControlForType('boolean');

	constructor(protected readonly breakpointObserver: BreakpointObserver, private injector: Injector) {
		this.observer = this.breakpointObserver.observe(this.breakpoints).pipe(pluck('matches'));
	}

	ngOnChanges({properties}: SimpleChanges): void {
		if (properties && this.properties) {
			this.propertyControls = objectKeys(this.properties)
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
					return a.property.name.localeCompare(b.property.name);
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
			this.getControlForTypeAlias(isPlaygroundProperty(property) ? property.options : undefined);

		if (!typeControl && isDevMode()) {
			console.warn(
				`NgDocPlayground didn't find the control for the @Input "${property.name}", the type "${type}" was not recognized'`,
			);
		}

		return typeControl;
	}

	private getControlForType(type: string): NgDocProvidedTypeControl | undefined {
		const token: InjectionToken<NgDocProvidedTypeControl> | undefined = getTokenForType(type);

		return token ? this.injector.get(token) : undefined;
	}

	private getControlForTypeAlias(options?: string[]): NgDocProvidedTypeControl | undefined {
		if (options && options.length) {
			let optionsIsValid: boolean = true;

			try {
				// checking that all values are extractable
				options.forEach((item: string) => extractValueOrThrow(item));
			} catch {
				optionsIsValid = false;
			}

			if (optionsIsValid) {
				const token: InjectionToken<NgDocProvidedTypeControl> | undefined = getTokenForType('NgDocTypeAlias');

				return token ? this.injector.get(token) : undefined;
			}
		}

		return undefined;
	}
}
