import { Directive, forwardRef, HostListener } from '@angular/core';
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
	constructor() {
		super({
			onIncomingUpdate: (value) => {
				toElement(this.elementRef).value = isPresent(value) ? String(Number(value)) : '';
			},
		});
	}

	@HostListener('blur')
	blurEvent(): void {
		this.touch();
	}

	@HostListener('input')
	inputEvent(): void {
		this.updateModel(Number(this.elementRef.nativeElement.value));
	}
}
