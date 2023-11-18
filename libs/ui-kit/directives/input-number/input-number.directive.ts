import { Directive, ElementRef, forwardRef, HostListener } from '@angular/core';
import { isPresent } from '@ng-doc/core/helpers/is-present';
import { NgDocBaseInput } from '@ng-doc/ui-kit/classes/base-input';
import { toElement } from '@ng-doc/ui-kit/helpers';
import { UntilDestroy } from '@ngneat/until-destroy';

@Directive({
	selector: `input[ngDocInputNumber]`,
	providers: [
		{ provide: NgDocBaseInput, useExisting: forwardRef(() => NgDocInputNumberDirective) },
	],
	standalone: true,
})
@UntilDestroy()
export class NgDocInputNumberDirective extends NgDocBaseInput<number> {
	constructor(override elementRef: ElementRef<HTMLInputElement>) {
		super();
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
