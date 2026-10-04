import { inject, Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

/**
 * Marks HTML as trusted, so it can be bound to `innerHTML` without sanitization. Use it only for
 * HTML that NgDoc generated.
 */
@Pipe({
  name: 'ngDocSanitizeHtml',
})
export class NgDocSanitizeHtmlPipe implements PipeTransform {
  private readonly sanitizer = inject(DomSanitizer);

  transform(value: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(value);
  }
}
