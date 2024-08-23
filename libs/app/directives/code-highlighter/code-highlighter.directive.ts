import { computed, Directive, ElementRef, inject, input, Signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { NgDocHighlighterService } from '@ng-doc/app/services';

@Directive({
  selector: '[ngDocHighlighter]',
  standalone: true,
  host: {
    '[innerHTML]': 'highlightedCode()',
  },
})
export class NgDocCodeHighlighterDirective {
  code = input.required<string>({ alias: 'ngDocHighlighter' });

  protected readonly highlightedCode: Signal<SafeHtml>;

  protected readonly element = inject(ElementRef<HTMLElement>).nativeElement;
  protected readonly highlighter = inject(NgDocHighlighterService);
  protected readonly sanitizer = inject(DomSanitizer);

  constructor() {
    this.highlightedCode = computed(() =>
      this.sanitizer.bypassSecurityTrustHtml(this.highlighter.highlight(this.code())),
    );
  }
}
