import {Directive, ElementRef, Input, OnInit} from '@angular/core';
import {NgDocFocusUtils} from '@ng-doc/ui-kit/utils';

@Directive({
	selector: '[ngDocAutofocus]',
	standalone: true,
})
export class NgDocAutofocusDirective implements OnInit {
	@Input()
	selectAll: boolean = false;

	constructor(private elementRef: ElementRef<HTMLElement>) {}

	ngOnInit(): void {
		const element: HTMLElement = this.elementRef.nativeElement;

		if (NgDocFocusUtils.isNativeKeyboardFocusable(element)) {
			element.focus();
		}

		if (this.selectAll && element instanceof HTMLInputElement) {
			Promise.resolve().then(() => element.select());
		}
	}
}
