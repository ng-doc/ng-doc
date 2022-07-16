import {
	ChangeDetectionStrategy,
	Component,
	ComponentRef,
	InjectionToken,
	Injector,
	Input,
	OnChanges,
	SimpleChanges,
	ViewChild,
	ViewContainerRef,
} from '@angular/core';
import {FormControl} from '@angular/forms';
import {getTokenForType} from '@ng-doc/app/helpers';
import {NgDocTypeControl} from '@ng-doc/app/interfaces';
import {NgDocPlaygroundProperty} from '@ng-doc/builder';
import {Constructor} from '@ng-doc/ui-kit';

@Component({
	selector: 'ng-doc-playground-property',
	templateUrl: './playground-property.component.html',
	styleUrls: ['./playground-property.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocPlaygroundPropertyComponent<T = unknown> implements OnChanges {
	@Input()
	name: string = '';

	@Input()
	property?: NgDocPlaygroundProperty;

	@Input()
	control?: FormControl;

	@ViewChild('propertyOutlet', {read: ViewContainerRef, static: true})
	propertyOutlet?: ViewContainerRef;

	private propertyControl?: ComponentRef<NgDocTypeControl>;

	constructor(private readonly injector: Injector) {}

	ngOnChanges({property, control}: SimpleChanges): void {
		if (property) {
			const typeControl: Constructor<NgDocTypeControl> | undefined = this.property?.type
				? this.getControlForType(this.property?.type)
				: undefined;

			if (typeControl) {
				this.propertyControl = this.propertyOutlet?.createComponent(typeControl);
				this.propertyControl?.instance.writeValue(this.control?.value);
			}
		}

		if (control) {
			this.control?.registerOnChange((value: string) => this.propertyControl?.instance?.writeValue(value));
			this.propertyControl?.instance.registerOnChange((value: string) => this.control?.setValue(value));
		}
	}

	private getControlForType(type: string): Constructor<NgDocTypeControl> | undefined {
		const token: InjectionToken<Constructor<NgDocTypeControl>> | undefined = getTokenForType<T>(type);

		return token ? this.injector.get(token) : undefined;
	}
}
