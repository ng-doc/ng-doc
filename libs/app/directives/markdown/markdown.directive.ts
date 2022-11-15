import {
	AfterViewInit,
	Directive,
	ElementRef,
	EventEmitter,
	Inject,
	Input,
	OnChanges,
	Output,
	Sanitizer
} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {NG_DOC_KEYWORDS_DICTIONARY} from '@ng-doc/app/tokens';
import {NgDocKeywordsDictionary} from '@ng-doc/app/types';
import {NgDocKeywordEntity} from '@ng-doc/builder';
import {
	NG_DOC_BLOCKQUOTE_TEMPLATE_ID,
	NG_DOC_CODE_TEMPLATE_ID,
	NG_DOC_LINK_TEMPLATE_ID,
	NG_DOC_TITLE_TEMPLATE_ID
} from '@ng-doc/builder/naming';
import {escapeHtml} from '@ng-doc/core';
import {marked} from 'marked';

const NOTE_ANCHOR: string = '<p><strong>Note</strong>';
const WARNING_ANCHOR: string = '<p><strong>Warning</strong>';

@Directive({
	selector: '[ngDocMarkdown]',
})
export class NgDocMarkdownDirective implements OnChanges, AfterViewInit {
	@Input()
	ngDocMarkdown: string = '';

	@Output()
	readonly rendered: EventEmitter<void> = new EventEmitter<void>();

	constructor(
		private readonly elementRef: ElementRef<HTMLElement>,
		private readonly router: Router,
		private readonly route: ActivatedRoute,
		@Inject(NG_DOC_KEYWORDS_DICTIONARY)
		private readonly keywordsDictionary: NgDocKeywordsDictionary
	) {}

	ngOnChanges(): void {
		const renderer: marked.RendererObject = {
			heading(text: string, level: 1 | 2 | 3 | 4 | 5 | 6): string {
				return `<div id="${NG_DOC_TITLE_TEMPLATE_ID}" data-level="${level}">${escapeHtml(text)}</div>`;
			},
			codespan: (code: string) => {
				const keywordEntity: NgDocKeywordEntity | undefined = this.keywordsDictionary[code];

				if (keywordEntity) {
					return `<code class="ng-doc-inline-code"><span id="${NG_DOC_LINK_TEMPLATE_ID}" data-path="${keywordEntity.path}">${keywordEntity.title}</span></code>`
				}
				return `<code class="ng-doc-inline-code2">${code}</code>`
			},
			code(code: string, language: string | undefined): string {
				return `<div id="${NG_DOC_CODE_TEMPLATE_ID}" data-language="${language}">${escapeHtml(code)}</div>`;
			},
			blockquote(quote: string): string {
				if (new RegExp(`^${NOTE_ANCHOR}`).test(quote)) {
					return `<div id="${NG_DOC_BLOCKQUOTE_TEMPLATE_ID}" data-type="note">
								${quote.replace(new RegExp(`^${NOTE_ANCHOR}\\s*`), '<p>')}
							</div>`;
				}

				if (new RegExp(`^${WARNING_ANCHOR}`).test(quote)) {
					return `<div id="${NG_DOC_BLOCKQUOTE_TEMPLATE_ID}" data-type="warning">
								${quote.replace(new RegExp(`^${WARNING_ANCHOR}\\s*`), '<p>')}
							</div>`;
				}

				return `<div id="${NG_DOC_BLOCKQUOTE_TEMPLATE_ID}">${quote}</div>`;
			},
		};

		marked.use({renderer});

		this.elementRef.nativeElement.innerHTML = marked.parse(this.ngDocMarkdown);
		this.rendered.emit();
	}

	ngAfterViewInit(): void {
		if (this.route.snapshot.fragment) {
			const element: HTMLElement | null = this.elementRef.nativeElement.querySelector(
				'#' + this.route.snapshot.fragment,
			);

			if (element) {
				element.scrollIntoView();
			}
		}
	}
}
