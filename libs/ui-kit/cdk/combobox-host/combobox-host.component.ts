import {
	AfterContentInit,
	ChangeDetectionStrategy,
	Component,
	ContentChild,
	ElementRef,
	Inject,
	Input,
	NgZone,
	Optional,
	SkipSelf,
	ViewChild,
} from '@angular/core';
import {
	NgDocBaseInput,
	NgDocDisplayValueHost,
	NgDocInputHost,
	NgDocListHost,
	NgDocOverlayHost,
} from '@ng-doc/ui-kit/classes';
import {NgDocDropdownComponent} from '@ng-doc/ui-kit/components/dropdown';
import {ngDocZoneOptimize} from '@ng-doc/ui-kit/observables';
import {NgDocDisplayValueFunction, NgDocOverlayPosition} from '@ng-doc/ui-kit/types';
import {UntilDestroy, untilDestroyed} from '@ngneat/until-destroy';
import {
	FL_CONTROL_HOST,
	FL_DEFAULT_COMPARE,
	FlCompareFunction,
	FlCompareHost,
	FlControlHost,
	FlControlSelector,
	provideControlHost,
} from 'flex-controls';
import {filter} from 'rxjs/operators';

@Component({
	selector: 'ng-doc-combobox-host',
	templateUrl: './combobox-host.component.html',
	styleUrls: ['./combobox-host.component.scss'],
	providers: [
		provideControlHost(NgDocComboboxHostComponent),
		{
			provide: NgDocOverlayHost,
			useExisting: NgDocComboboxHostComponent,
		},
		{
			provide: NgDocInputHost,
			useExisting: NgDocComboboxHostComponent,
		},
		{
			provide: FlCompareHost,
			useExisting: NgDocComboboxHostComponent,
		},
		{
			provide: NgDocDisplayValueHost,
			useExisting: NgDocComboboxHostComponent,
		},
		{
			provide: NgDocListHost,
			useExisting: NgDocComboboxHostComponent,
		},
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
@UntilDestroy()
export class NgDocComboboxHostComponent<T>
	extends FlControlHost<T>
	implements
		NgDocOverlayHost,
		NgDocInputHost<string>,
		FlCompareHost<T>,
		NgDocDisplayValueHost<T>,
		NgDocListHost,
		AfterContentInit
{
	@Input()
	compareFn: FlCompareFunction<T> = FL_DEFAULT_COMPARE;

	@Input()
	displayValueFn: NgDocDisplayValueFunction<T> = String;

	@ViewChild('origin', {read: ElementRef, static: true})
	origin?: ElementRef<HTMLElement>;

	@ContentChild(NgDocDropdownComponent)
	dropdown?: NgDocDropdownComponent;

	@ContentChild(NgDocBaseInput)
	inputControl?: NgDocBaseInput<string>;

	readonly positions: NgDocOverlayPosition[] = ['bottom-center', 'top-center'];

	constructor(
		protected ngZone: NgZone,
		@Inject(FL_CONTROL_HOST)
		@SkipSelf()
		@Optional()
		protected override host?: FlControlHost<T>,
	) {
		super(host);
	}

	ngAfterContentInit(): void {
		this.inputControl?.valueChange
			.pipe(
				filter(() => !!this.inputControl?.isFocused),
				untilDestroyed(this),
				ngDocZoneOptimize(this.ngZone),
			)
			.subscribe(() => this.dropdown?.open());

		this.typedControlChange(FlControlSelector)
			.pipe(untilDestroyed(this))
			.subscribe(() => this.dropdown?.close());
	}

	protected override incomingUpdate(value: T | null): void {
		super.incomingUpdate(value);

		if (value) {
			this.dropdown?.close();
		}
	}

	get listHostOrigin(): ElementRef<HTMLElement> | undefined {
		return this.inputControl?.elementRef;
	}

	get searchText(): string {
		return this.hasValue ? '' : this.inputControl?.value || '';
	}

	get width(): number {
		return this.origin?.nativeElement.offsetWidth || 0;
	}

	get panelClass(): string {
		return `ng-doc-combobox-host-overlay`;
	}

	clickEvent(): void {
		if (!this.disabled) {
			this.dropdown?.open();
		}
	}
}
