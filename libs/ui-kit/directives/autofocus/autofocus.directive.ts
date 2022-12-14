import {Directive, ElementRef, OnInit} from '@angular/core';
import {NgDocFocusUtils} from '@ng-doc/ui-kit/utils';

@Directive({
	selector: '[ngDocAutofocus]',
})
export class NgDocAutofocusDirective implements OnInit {
	constructor(private elementRef: ElementRef<HTMLElement>) {}

	ngOnInit(): void {
		if (NgDocFocusUtils.isNativeKeyboardFocusable(this.elementRef.nativeElement)) {
			this.elementRef.nativeElement.focus();
		}
	}
}
