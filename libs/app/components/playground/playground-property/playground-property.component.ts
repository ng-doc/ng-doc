import {
	ChangeDetectionStrategy,
	Component,
	ComponentRef,
	HostBinding,
	Input,
	OnChanges,
	SimpleChanges,
	ViewChild,
	ViewContainerRef,
} from '@angular/core';
import {FormControl} from '@angular/forms';
import {isPlaygroundProperty} from '@ng-doc/app/helpers';
import {NgDocProvidedTypeControl, NgDocTypeControl, NgDocTypeControlProviderOptions} from '@ng-doc/app/interfaces';
import {NgDocSanitizeHtmlPipe} from '@ng-doc/app/pipes';
import {NgDocPlaygroundContent, NgDocPlaygroundProperty} from '@ng-doc/core/interfaces';
import {NgDocLabelComponent, NgDocTooltipDirective} from '@ng-doc/ui-kit';

@Component({
	selector: 'ng-doc-playground-property',
	templateUrl: './playground-property.component.html',
	styleUrls: ['./playground-property.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
	imports: [NgDocLabelComponent, NgDocTooltipDirective, NgDocSanitizeHtmlPipe],
})
export class NgDocPlaygroundPropertyComponent implements OnChanges {
	@Input()
	name: string = '';

	@Input()
	property?: NgDocPlaygroundProperty | NgDocPlaygroundContent;

	@Input()
	typeControl?: NgDocProvidedTypeControl;

	@Input()
	control?: FormControl;

	@Input()
	defaultValue?: unknown;

	@ViewChild('propertyOutlet', {read: ViewContainerRef, static: true})
	propertyOutlet?: ViewContainerRef;

	protected option?: NgDocTypeControlProviderOptions;
	private propertyTypeControl?: ComponentRef<NgDocTypeControl>;

	ngOnChanges({property, control, typeControl, defaultValue}: SimpleChanges): void {
		if ((property || control || typeControl || defaultValue) && this.property && this.typeControl) {
			this.propertyTypeControl?.destroy();
			this.propertyTypeControl = undefined;

			if (this.typeControl && this.propertyOutlet) {
				this.propertyTypeControl = this.propertyOutlet.createComponent(this.typeControl.control);
				this.propertyTypeControl.instance.name = this.name;
				this.propertyTypeControl.instance.description = this.tooltipContent;
				this.propertyTypeControl.instance.options = isPlaygroundProperty(this.property)
					? this.property.options
					: undefined;
				this.propertyTypeControl.instance.default = this.defaultValue;
				this.propertyTypeControl.instance.writeValue(this.control?.value);

				this.option = this.typeControl.options;
			}

			if (this.control) {
				this.control?.registerOnChange((value: string) => this.propertyTypeControl?.instance?.writeValue(value));
				this.propertyTypeControl?.instance.registerOnChange((value: unknown) => this.control?.setValue(value));
				this.propertyTypeControl?.instance.registerOnTouched(() => this.control?.markAsTouched());
			}
		}
	}

	@HostBinding('attr.data-has-property-control')
	get hasPropertyControl(): boolean {
		return !!this.propertyTypeControl;
	}

	get tooltipContent(): string {
		return this.property && isPlaygroundProperty(this.property) ? this.property.description ?? '' : '';
	}
}
