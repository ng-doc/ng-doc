import { computed, Directive, ElementRef, inject, input, Signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { NgDocHighlighterService } from '@ng-doc/app/services';

/**
 * Renders the given Angular HTML code, highlighted by `NgDocHighlighterService`, into its host
 * element.
 */
@Directive({
  selector: '[ngDocHighlighter]',
  host: {
    '[innerHTML]': 'highlightedCode()',
  },
})
export class NgDocCodeHighlighterDirective {
  /** The code to highlight. */
  readonly code = input.required<string>({ alias: 'ngDocHighlighter' });

  protected readonly element = inject(ElementRef<HTMLElement>).nativeElement;
  protected readonly highlighter = inject(NgDocHighlighterService);
  protected readonly sanitizer = inject(DomSanitizer);

  // `highlight` reads the highlighter's `ready` signal, so the code is highlighted again once
  // Shiki has loaded.
  protected readonly highlightedCode: Signal<SafeHtml> = computed(() =>
    this.sanitizer.bypassSecurityTrustHtml(this.highlighter.highlight(this.code())),
  );
}
