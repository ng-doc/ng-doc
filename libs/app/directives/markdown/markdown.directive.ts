import {Directive, ElementRef, EventEmitter, Input, OnChanges, Output} from '@angular/core';
import {marked} from 'marked';

@Directive({
	selector: '[ngDocMarkdown]',
})
export class NgDocMarkdownDirective implements OnChanges {
	@Input() ngDocMarkdown: string = '';
	@Output() rendered: EventEmitter<void> = new EventEmitter<void>();

	constructor(private readonly elementRef: ElementRef<HTMLElement>) {}

	ngOnChanges(): void {
		this.elementRef.nativeElement.innerHTML = marked.parse(this.ngDocMarkdown);
		this.rendered.emit();
	}
}
