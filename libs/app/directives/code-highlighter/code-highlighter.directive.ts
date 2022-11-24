import {Directive, ElementRef, HostBinding, Input, OnChanges} from '@angular/core';
import {SafeHtml} from '@angular/platform-browser';
import highlight, {AutoHighlightResult} from 'highlight.js';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import less from 'highlight.js/lib/languages/less';
import scss from 'highlight.js/lib/languages/scss';
import typescript from 'highlight.js/lib/languages/typescript';

highlight.registerLanguage('javascript', javascript);
highlight.registerLanguage('typescript', typescript);
highlight.registerLanguage('css', css);
highlight.registerLanguage('less', less);
highlight.registerLanguage('scss', scss);
highlight.registerLanguage('json', json);
highlight.registerLanguage('bash', bash);

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
			const result: AutoHighlightResult = highlight.highlightAuto(this.code, [this.language]);

			this.elementRef.nativeElement.innerHTML = result.value ?? this.html;
		} else {
			this.elementRef.nativeElement.innerHTML = this.html;
		}
	}
}
