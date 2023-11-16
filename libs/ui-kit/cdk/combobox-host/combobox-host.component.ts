import {
	AfterContentInit,
	ChangeDetectionStrategy,
	Component,
	ContentChild,
	ElementRef,
	forwardRef,
	inject,
	Input,
	NgZone,
	ViewChild,
} from '@angular/core';
import {
	NgDocBaseInput,
	NgDocDisplayValueHost,
	NgDocInputHost,
	NgDocListHost,
	NgDocOverlayHost,
} from '@ng-doc/ui-kit/classes';
import { NgDocDropdownComponent } from '@ng-doc/ui-kit/components/dropdown';
import { NgDocDropdownHandlerDirective } from '@ng-doc/ui-kit/directives/dropdown-handler';
import { NgDocFocusCatcherDirective } from '@ng-doc/ui-kit/directives/focus-catcher';
import { ngDocZoneOptimize } from '@ng-doc/ui-kit/observables';
import { NgDocDisplayValueFunction, NgDocOverlayPosition } from '@ng-doc/ui-kit/types';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import {
	DI_DEFAULT_COMPARE,
	DICompareFunction,
	DICompareHost,
	DIControl,
	DIStateControl,
	injectHostControl,
	provideCompareHost,
	provideHostControl,
} from 'di-controls';
import { filter } from 'rxjs/operators';

@Component({
	selector: 'ng-doc-combobox-host',
	templateUrl: './combobox-host.component.html',
	styleUrls: ['./combobox-host.component.scss'],
	providers: [
		provideHostControl(forwardRef(() => NgDocComboboxHostComponent)),
		provideCompareHost(forwardRef(() => NgDocComboboxHostComponent)),
		{
			provide: NgDocOverlayHost,
			useExisting: forwardRef(() => NgDocComboboxHostComponent),
		},
		{
			provide: NgDocInputHost,
			useExisting: forwardRef(() => NgDocComboboxHostComponent),
		},
		{
			provide: NgDocDisplayValueHost,
			useExisting: forwardRef(() => NgDocComboboxHostComponent),
		},
		{
			provide: NgDocListHost,
			useExisting: forwardRef(() => NgDocComboboxHostComponent),
		},
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
	imports: [NgDocFocusCatcherDirective, NgDocDropdownHandlerDirective],
})
@UntilDestroy()
export class NgDocComboboxHostComponent<T>
	extends DIControl<T>
	implements
		NgDocOverlayHost,
		NgDocInputHost<string>,
		DICompareHost<T>,
		NgDocDisplayValueHost<T>,
		NgDocListHost,
		AfterContentInit
{
	@Input()
	compareFn: DICompareFunction<T> = DI_DEFAULT_COMPARE;

	@Input()
	displayValueFn: NgDocDisplayValueFunction<T> = String;

	@ViewChild('origin', { read: ElementRef, static: true })
	origin?: ElementRef<HTMLElement>;

	@ContentChild(NgDocDropdownComponent)
	dropdown?: NgDocDropdownComponent;

	@ContentChild(NgDocBaseInput)
	inputControl?: NgDocBaseInput<string>;

	readonly positions: NgDocOverlayPosition[] = ['bottom-center', 'top-center'];

	protected readonly ngZone: NgZone = inject(NgZone);

	constructor() {
		super({
			host: injectHostControl({ skipSelf: true, optional: true }),
			onChildControlChange: (control) => {
				if (control instanceof DIStateControl) {
					this.dropdown?.close();
				}
			},
		});
	}

	ngAfterContentInit(): void {
		this.inputControl?.changes
			.pipe(
				filter(() => !!this.inputControl?.isFocused),
				untilDestroyed(this),
				ngDocZoneOptimize(this.ngZone),
			)
			.subscribe(() => this.dropdown?.open());
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
