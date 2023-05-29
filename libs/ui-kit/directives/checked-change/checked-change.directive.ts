import {Directive, ElementRef, EventEmitter, HostListener, Input, Output, Renderer2} from '@angular/core';

@Directive({
	selector: 'input[ngDocChecked], input[ngDocCheckedChange]',
	standalone: true,
})
export class NgDocCheckedChangeDirective {
	@Input()
	set ngDocChecked(checked: null | boolean) {
		this.updateProperty('checked', checked || false);
		this.updateProperty('indeterminate', checked === null);
	}

	@Output()
	readonly ngDocCheckedChange: EventEmitter<boolean> = new EventEmitter<boolean>();

	constructor(private readonly element: ElementRef<HTMLInputElement>, private readonly renderer: Renderer2) {
		this.updateProperty('checked', false);
	}

	@HostListener('change', ['$event.target'])
	onChange({checked}: HTMLInputElement): void {
		this.updateProperty('indeterminate', false);
		this.ngDocCheckedChange.emit(checked);
	}

	private updateProperty(property: 'checked' | 'indeterminate', value: boolean): void {
		this.renderer.setProperty(this.element.nativeElement, property, value);
	}
}
