import {Directive, ElementRef, Input, OnChanges, OnInit, Renderer2, SimpleChanges} from '@angular/core';

/** Directive rotates host with transition */
@Directive({
	selector: '[ngDocRotator]',
	standalone: true,
})
export class NgDocRotatorDirective implements OnChanges, OnInit {
	/** Rotator state */
	@Input('ngDocRotator')
	rotated: boolean = false;

	/** Start position angle */
	@Input()
	from: number = 0;

	/** End position anle */
	@Input()
	to: number = 90;

	constructor(private readonly elementRef: ElementRef<HTMLElement>, private readonly renderer: Renderer2) {}

	ngOnChanges({rotated}: SimpleChanges): void {
		if (rotated) {
			this.rotate(this.rotated ? this.to : this.from, true);
		}
	}

	ngOnInit(): void {
		this.rotate(this.rotated ? this.to : this.from);
	}

	private rotate(degree: number, animated?: boolean): void {
		if (animated) {
			this.renderer.setStyle(this.elementRef.nativeElement, `transition`, `var(--ng-doc-transition)`);
		}
		this.renderer.setStyle(this.elementRef.nativeElement, `transform`, `rotateZ(${degree}deg`);
	}
}
