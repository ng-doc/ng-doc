import { Directive, ElementRef, inject, input, OnChanges } from '@angular/core';
import { NgDocHighlighterService } from '@ng-doc/app/services';

@Directive({
  selector: '[ngDocHighlighter]',
  standalone: true,
})
export class NgDocCodeHighlighterDirective implements OnChanges {
  code = input.required<string>({ alias: 'ngDocHighlighter' });

  protected readonly element = inject(ElementRef<HTMLElement>).nativeElement;
  protected readonly highlighter = inject(NgDocHighlighterService);

  ngOnChanges(): void {
    this.element.innerHTML = this.highlighter.highlight(this.code());
  }
}
