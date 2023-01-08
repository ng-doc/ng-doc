import {
	AfterViewChecked,
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	ContentChild,
	ElementRef,
	HostBinding,
	Inject,
	Input,
	Optional,
	ViewChild,
} from '@angular/core';
import {NgDocBaseInput} from '@ng-doc/ui-kit/classes/base-input';
import {NgDocInputHost} from '@ng-doc/ui-kit/classes/input-host';
import {ngDocMakePure} from '@ng-doc/ui-kit/decorators';
import {NgDocFocusCatcherDirective} from '@ng-doc/ui-kit/directives/focus-catcher';
import {NgDocContextWithImplicit} from '@ng-doc/ui-kit/interfaces';
import {NG_DOC_INPUT_CONTROL} from '@ng-doc/ui-kit/tokens';
import {NgDocContent, NgDocTextAlign} from '@ng-doc/ui-kit/types';
import {UntilDestroy} from '@ngneat/until-destroy';
import {FL_CONTROL_HOST, FlControl, FlControlHost} from 'flex-controls';

@Component({
	selector: 'ng-doc-input-wrapper',
	templateUrl: './input-wrapper.component.html',
	styleUrls: ['./input-wrapper.component.scss'],
	providers: [
		{
			provide: NgDocInputHost,
			useExisting: NgDocInputWrapperComponent,
		},
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
@UntilDestroy()
export class NgDocInputWrapperComponent<T, B = unknown> implements AfterViewChecked, NgDocInputHost<T> {
	@Input()
	blurContent: NgDocContent<NgDocContextWithImplicit<B | null>> = '';

	@Input()
	blurContext: B | null = null;

	@Input()
	leftContent: NgDocContent = '';

	@Input()
	rightContent: NgDocContent = '';

	@Input()
	@HostBinding('attr.data-ng-doc-align')
	align: NgDocTextAlign = 'left';

	@ContentChild(NgDocBaseInput)
	input?: NgDocBaseInput<T>;

	@ContentChild(NG_DOC_INPUT_CONTROL)
	inputControl?: FlControl<T>;

	@ViewChild(NgDocFocusCatcherDirective, {static: true})
	focusCatcher?: NgDocFocusCatcherDirective;

	constructor(
		public elementRef: ElementRef<HTMLElement>,
		protected changeDetectorRef: ChangeDetectorRef,
		@Inject(FL_CONTROL_HOST)
		@Optional()
		protected controlHost?: FlControlHost<unknown>,
	) {}

	ngAfterViewChecked(): void {
		this.changeDetectorRef.markForCheck();
	}

	@ngDocMakePure
	getBlurContext($implicit: B | null): NgDocContextWithImplicit<B | null> {
		return {$implicit};
	}

	@HostBinding('attr.data-ng-doc-input-disabled')
	get disabled(): boolean {
		return !!this.inputControl?.disabled;
	}

	inputHasValue(): boolean {
		return !!this.inputControl?.hasValue;
	}

	get blurContentIsVisible(): boolean {
		return !!this.blurContent && (!this.input?.isFocused || this.input?.isReadonly);
	}

	// eslint-disable-next-line @typescript-eslint/no-empty-function
	emptyEvent(): void {}
}