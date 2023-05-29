import {Directive, ElementRef, HostListener} from '@angular/core';
import {isPresent} from '@ng-doc/core/helpers/is-present';
import {NgDocBaseInput} from '@ng-doc/ui-kit/classes/base-input';
import {toElement} from '@ng-doc/ui-kit/helpers';
import {UntilDestroy} from '@ngneat/until-destroy';

/** Directive converts any input data or model to text */
@Directive({
	selector: `input[ngDocInputString]`,
	providers: [{provide: NgDocBaseInput, useExisting: NgDocInputStringDirective}],
	standalone: true,
})
@UntilDestroy()
export class NgDocInputStringDirective extends NgDocBaseInput<string> {
	constructor(override elementRef: ElementRef<HTMLInputElement>) {
		super();
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
