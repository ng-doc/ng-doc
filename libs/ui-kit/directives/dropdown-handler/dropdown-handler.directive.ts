import {Directive, HostListener, Input} from '@angular/core';
import {NgDocDropdownComponent} from '@ng-doc/ui-kit/components/dropdown';

@Directive({
	selector: '[ngDocDropdownHandler]',
	standalone: true,
})
export class NgDocDropdownHandlerDirective {
	@Input('ngDocDropdownHandler')
	dropdown?: NgDocDropdownComponent;

	@HostListener('keydown', ['$event'])
	keyboardEvent(event: KeyboardEvent): void {
		if (this.dropdown) {
			if (event.key === 'ArrowDown' && !this.dropdown.isOpened) {
				event.preventDefault();
				this.dropdown.open();
			}

			if (event.key === 'Escape' && this.dropdown.isOpened) {
				event.preventDefault();
				this.dropdown.close();
			}
		}
	}
}
