import { Directive, ElementRef, HostBinding, Input, OnChanges } from '@angular/core';
import { HighlightResult } from 'highlight.js';
import highlight from 'highlight.js/lib/core';
import xml from 'highlight.js/lib/languages/xml';

highlight.registerLanguage('html', xml);
highlight.registerLanguage('xml', xml);

@Directive({
	selector: 'code[ngDocCodeHighlighter]',
	standalone: true,
})
export class NgDocCodeHighlighterDirective implements OnChanges {
	@Input('ngDocCodeHighlighter')
	code: string = '';

	@Input()
	html: string = '';

	@Input()
	language: string = 'typescript';

	@HostBinding('class.hljs')
	protected highlightJsClass: boolean = true;

	constructor(private readonly elementRef: ElementRef<HTMLElement>) {}

	ngOnChanges(): void {
		if (this.code) {
			const result: HighlightResult = highlight.highlight(this.code, { language: this.language });

			this.elementRef.nativeElement.innerHTML = result.value ?? this.html;
		} else {
			this.elementRef.nativeElement.innerHTML = this.html;
		}
	}
}
