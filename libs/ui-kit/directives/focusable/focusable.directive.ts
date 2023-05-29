import {Directive, HostBinding, Input} from '@angular/core';

@Directive({
    selector: '[ngDocFocusable]',
    exportAs: 'ngDocFocusable',
    standalone: true,
})
export class NgDocFocusableDirective {
	@Input('ngDocFocusable')
	focusable: boolean = true;

	@HostBinding('attr.tabIndex')
	get tabIndex(): number {
		return this.focusable ? 0 : -1;
	}
}
