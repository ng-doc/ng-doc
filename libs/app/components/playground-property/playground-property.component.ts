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
import {getTokenForType, isPlaygroundProperty} from '@ng-doc/app/helpers';
import {NgDocTypeControl} from '@ng-doc/app/interfaces';
import {NgDocPlaygroundDynamicContent, NgDocPlaygroundProperty} from '@ng-doc/builder';
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
	property?: NgDocPlaygroundProperty | NgDocPlaygroundDynamicContent;

	@Input()
	control?: FormControl;

	@ViewChild('propertyOutlet', {read: ViewContainerRef, static: true})
	propertyOutlet?: ViewContainerRef;

	private propertyControl?: ComponentRef<NgDocTypeControl>;

	constructor(private readonly injector: Injector) {}

	ngOnChanges({property, control}: SimpleChanges): void {
		if (property && this.property) {
			const type: string = isPlaygroundProperty(this.property) ? this.property.type : 'boolean';
			const typeControl: Constructor<NgDocTypeControl> | undefined = this.getControlForType(type);

			if (typeControl && this.propertyOutlet) {
				this.propertyControl = this.propertyOutlet.createComponent(typeControl);
				this.propertyControl.instance.default = isPlaygroundProperty(this.property)
					? this.property.default
					: undefined;
				this.propertyControl.instance.writeValue(this.control?.value);
			}
		}

		if (control) {
			this.control?.registerOnChange((value: string) => this.propertyControl?.instance?.writeValue(value));
			this.propertyControl?.instance.registerOnChange((value: unknown) => this.control?.setValue(value));
		}
	}

	get tooltipContent(): string {
		return this.property && isPlaygroundProperty(this.property) ? this.property.description ?? '' : '';
	}

	private getControlForType(type: string): Constructor<NgDocTypeControl> | undefined {
		const token: InjectionToken<Constructor<NgDocTypeControl>> | undefined = getTokenForType<T>(type);

		return token ? this.injector.get(token) : undefined;
	}
}
