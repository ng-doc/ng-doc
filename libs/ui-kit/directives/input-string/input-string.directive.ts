import {Directive, ElementRef, HostListener, Inject, Optional, Renderer2} from '@angular/core';
import {isPresent} from '@ng-doc/core/helpers/is-present';
import {NgDocBaseInput} from '@ng-doc/ui-kit/classes/base-input';
import {toElement} from '@ng-doc/ui-kit/helpers';
import {NG_DOC_INPUT_CONTROL} from '@ng-doc/ui-kit/tokens';
import {UntilDestroy} from '@ngneat/until-destroy';
import {FL_CONTROL_HOST, FlControlHost} from 'flex-controls';

/** Directive converts any input data or model to text */
@Directive({
	selector: `input[ngDocInputString]`,
	providers: [
		{provide: NG_DOC_INPUT_CONTROL, useExisting: NgDocInputStringDirective},
		{provide: NgDocBaseInput, useExisting: NgDocInputStringDirective},
	],
})
@UntilDestroy()
export class NgDocInputStringDirective extends NgDocBaseInput<string> {
	constructor(
		public override elementRef: ElementRef<HTMLInputElement>,
		protected override renderer: Renderer2,
		@Inject(FL_CONTROL_HOST)
		@Optional()
		protected override host?: FlControlHost<string>,
	) {
		super(elementRef, renderer, host);
	}

	@HostListener('blur')
	blurEvent(): void {
		this.onTouched();
	}

	@HostListener('input')
	inputEvent(): void {
		this.updateModel(this.elementRef.nativeElement.value);
	}

	protected override incomingUpdate(value: string | null): void {
		toElement(this.elementRef).value = isPresent(value) ? String(value) : '';
	}
}
