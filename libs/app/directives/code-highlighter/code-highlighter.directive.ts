import { Directive, ElementRef, inject, input, OnChanges } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { NgDocHighlighterService } from '@ng-doc/app/services';

@Directive({
  selector: '[ngDocHighlighter]',
  standalone: true,
})
export class NgDocCodeHighlighterDirective implements OnChanges {
  code = input.required<string>({ alias: 'ngDocHighlighter' });

  protected readonly element = inject(ElementRef<HTMLElement>).nativeElement;
  protected readonly highlighter = inject(NgDocHighlighterService);
  protected readonly sanitizer = inject(DomSanitizer);

  ngOnChanges(): void {
    this.element.innerHTML = this.sanitizer.bypassSecurityTrustHtml(
      this.highlighter.highlight(this.code()),
    );
  }
}
