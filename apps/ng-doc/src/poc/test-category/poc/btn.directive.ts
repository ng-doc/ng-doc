import {ChangeDetectorRef, ComponentRef, Directive, ElementRef, Input, OnChanges} from '@angular/core';

@Directive({
	selector: '[ngDocBtn]',
	standalone: true,
})
export class BtnDirective implements OnChanges {
	@Input('ngDocBtn')
	text: string = '234';

	@Input()
	num: number = 123;

	@Input()
	checker: boolean = true;

	constructor(
		private readonly element: ElementRef<HTMLElement>,
		private readonly changeDetectorRef: ChangeDetectorRef,
	) {
		setTimeout(() => {
			this.changeDetectorRef.detectChanges();
		}, 100);
	}

	ngOnChanges(): void {
		this.element.nativeElement.innerHTML = this.text;
	}
}
