import {Directive, ElementRef, EventEmitter, Input, OnChanges, Output} from '@angular/core';
import {marked} from 'marked';

@Directive({
	selector: '[ngDocMarkdown]',
})
export class NgDocMarkdownDirective implements OnChanges {
	@Input()
	ngDocMarkdown: string = '';

	@Output()
	readonly rendered: EventEmitter<void> = new EventEmitter<void>();

	constructor(private readonly elementRef: ElementRef<HTMLElement>) {}

	ngOnChanges(): void {
		const renderer: marked.RendererObject = {
			heading(text: string, level: 1 | 2 | 3 | 4 | 5 | 6, raw: string, slugger: marked.Slugger): string {
				const escapedText: string = text.toLowerCase().replace(/[^\w]+/g, '-');

				return `
            		<h${level}>
              			<a name="${escapedText}" class="anchor" href="#${escapedText}">
                			<span class="header-link">click</span>
              			</a>
              			${text}
            		</h${level}>`;
			},
		};

		marked.use({renderer});

		this.elementRef.nativeElement.innerHTML = marked.parse(this.ngDocMarkdown);
		this.rendered.emit();
	}
}
