import {Directive, ElementRef, HostBinding, Input, OnChanges} from '@angular/core';
import {HighlightResult} from 'highlight.js';
import highlight from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import less from 'highlight.js/lib/languages/less';
import markdown from 'highlight.js/lib/languages/markdown';
import scss from 'highlight.js/lib/languages/scss';
import twig from 'highlight.js/lib/languages/twig';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';

highlight.registerLanguage('javascript', javascript);
highlight.registerLanguage('typescript', typescript);
highlight.registerLanguage('css', css);
highlight.registerLanguage('less', less);
highlight.registerLanguage('scss', scss);
highlight.registerLanguage('json', json);
highlight.registerLanguage('bash', bash);
highlight.registerLanguage('markdown', markdown);
highlight.registerLanguage('twig', twig);
highlight.registerLanguage('html', xml);
highlight.registerLanguage('xml', xml);

@Directive({
	selector: 'code[ngDocCodeHighlighter]',
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
			const result: HighlightResult = highlight.highlight(this.language, this.code);

			this.elementRef.nativeElement.innerHTML = result.value ?? this.html;
		} else {
			this.elementRef.nativeElement.innerHTML = this.html;
		}
	}
}
