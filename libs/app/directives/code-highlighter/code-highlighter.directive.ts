import {AfterViewInit, Directive, ElementRef} from '@angular/core';
import highlight from 'highlight.js';
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
	selector: '[ngDocCodeHighlighter]',
})
export class NgDocCodeHighlighterDirective implements AfterViewInit {
	constructor(private readonly elementRef: ElementRef<HTMLElement>) {}

	ngAfterViewInit(): void {
		highlight.highlightElement(this.elementRef.nativeElement);
	}
}
