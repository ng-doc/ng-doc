import {
	ChangeDetectionStrategy,
	Component,
	ComponentRef,
	HostBinding,
	InjectionToken,
	Injector,
	Input,
	isDevMode,
	OnChanges,
	SimpleChanges,
	ViewChild,
	ViewContainerRef,
} from '@angular/core';
import {FormControl} from '@angular/forms';
import {getTokenForType, isPlaygroundProperty} from '@ng-doc/app/helpers';
import {NgDocProvidedTypeControl, NgDocTypeControl, NgDocTypeControlProviderOptions} from '@ng-doc/app/interfaces';
import {extractValueOrThrow, NgDocPlaygroundDynamicContent, NgDocPlaygroundProperty} from '@ng-doc/core';

@Component({
	selector: 'ng-doc-playground-property',
	templateUrl: './playground-property.component.html',
	styleUrls: ['./playground-property.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocPlaygroundPropertyComponent implements OnChanges {
	@Input()
	name: string = '';

	@Input()
	property?: NgDocPlaygroundProperty | NgDocPlaygroundDynamicContent;

	@Input()
	control?: FormControl;

	@ViewChild('propertyOutlet', {read: ViewContainerRef, static: true})
	propertyOutlet?: ViewContainerRef;

	option?: NgDocTypeControlProviderOptions;

	private propertyControl?: ComponentRef<NgDocTypeControl>;

	constructor(private readonly injector: Injector) {}

	ngOnChanges({property, control}: SimpleChanges): void {
		if (property && this.property) {
			this.propertyControl?.destroy();
			this.propertyControl = undefined;

			const type: string = isPlaygroundProperty(this.property) ? this.property.type : 'boolean';
			const typeControl: NgDocProvidedTypeControl | undefined =
				this.getControlForType(type) ??
				this.getControlForTypeAlias(isPlaygroundProperty(this.property) ? this.property.options : undefined);

			if (typeControl && this.propertyOutlet) {
				this.propertyControl = this.propertyOutlet.createComponent(typeControl.control);
				this.propertyControl.instance.name = this.name;
				this.propertyControl.instance.description = this.tooltipContent;
				this.propertyControl.instance.options = isPlaygroundProperty(this.property)
					? this.property.options
					: undefined;
				this.propertyControl.instance.default = isPlaygroundProperty(this.property)
					? this.property.default
					: undefined;
				this.propertyControl.instance.writeValue(this.control?.value);

				this.option = typeControl.options;
			} else if (isDevMode()) {
				console.warn(
					`NgDocPlayground didn't find the control for the @Input "${this.name}", the type "${type}" was not recognized'`,
				);
			}
		}

		if (control) {
			this.control?.registerOnChange((value: string) => this.propertyControl?.instance?.writeValue(value));
			this.propertyControl?.instance.registerOnChange((value: unknown) => this.control?.setValue(value));
			this.propertyControl?.instance.registerOnTouched(() => this.control?.markAsTouched());
		}
	}

	@HostBinding('attr.data-has-property-control')
	get hasPropertyControl(): boolean {
		return !!this.propertyControl;
	}

	get tooltipContent(): string {
		return this.property && isPlaygroundProperty(this.property) ? this.property.description ?? '' : '';
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
