import {Directive, ElementRef, HostBinding, inject, Renderer2} from '@angular/core';
import {FL_CONTROL_HOST, FlControl} from 'flex-controls';
import {FlBaseControlHost} from 'flex-controls/interfaces';

@Directive()
export abstract class NgDocBaseInput<T> extends FlControl<T> {
	elementRef: ElementRef<HTMLInputElement> = inject(ElementRef);
	private renderer: Renderer2 = inject(Renderer2);

	protected constructor() {
		super(
			inject<FlBaseControlHost<T, T> | undefined>(FL_CONTROL_HOST, {optional: true}) || undefined,
		);
	}

	@HostBinding('class')
	get hostClasses(): string {
		return 'ng-doc-input';
	}

	get placeholder(): string {
		return this.elementRef.nativeElement.placeholder || '';
	}

	get isFocused(): boolean {
		return document.activeElement === this.elementRef.nativeElement;
	}

	get isReadonly(): boolean {
		return this.elementRef.nativeElement.readOnly;
	}

	get value(): string {
		return this.elementRef.nativeElement.value;
	}

	focus(): void {
		this.elementRef.nativeElement.focus();
	}

	blink(): void {
		this.renderer.removeClass(this.elementRef.nativeElement, '-blink');
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		this.elementRef.nativeElement.offsetWidth;
		this.renderer.addClass(this.elementRef.nativeElement, '-blink');
	}
}
