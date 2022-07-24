import {Directive, ElementRef, HostListener, Inject, Optional, Renderer2} from '@angular/core';
import {isPresent} from '@ng-doc/core';
import {NgDocBaseInput} from '@ng-doc/ui-kit/classes';
import {toElement} from '@ng-doc/ui-kit/helpers';
import {NG_DOC_INPUT_CONTROL} from '@ng-doc/ui-kit/tokens';
import {UntilDestroy} from '@ngneat/until-destroy';
import {FL_CONTROL_HOST, FlControlHost} from 'flex-controls';

@Directive({
	selector: `input[ngDocInputNumber]`,
	providers: [
		{provide: NG_DOC_INPUT_CONTROL, useExisting: NgDocInputNumberDirective},
		{provide: NgDocBaseInput, useExisting: NgDocInputNumberDirective},
	],
})
@UntilDestroy()
export class NgDocInputNumberDirective extends NgDocBaseInput<number> {
	constructor(
		public override elementRef: ElementRef<HTMLInputElement>,
		protected override renderer: Renderer2,
		@Inject(FL_CONTROL_HOST)
		@Optional()
		protected override host?: FlControlHost<number>,
	) {
		super(elementRef, renderer, host);
	}

	@HostListener('blur')
	blurEvent(): void {
		this.onTouched();
	}

	@HostListener('input')
	inputEvent(): void {
		this.updateModel(Number(this.elementRef.nativeElement.value));
	}

	protected override incomingUpdate(value: number | null): void {
		toElement(this.elementRef).value = isPresent(value) ? String(Number(value)) : '';
	}
}
