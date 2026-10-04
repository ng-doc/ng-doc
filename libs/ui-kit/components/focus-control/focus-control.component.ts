import { ChangeDetectionStrategy, Component, DOCUMENT, inject, input } from '@angular/core';
import { NgDocFocusableDirective } from '@ng-doc/ui-kit/directives/focusable';
import { NgDocFocusUtils } from '@ng-doc/ui-kit/utils';

/**
 * Surrounds its content with two focus traps. Tabbing out of the content moves the focus to the
 * element before or after `focusHost` in the document, instead of leaving it on the traps.
 */
@Component({
  selector: 'ng-doc-focus-control',
  template: `
    <div [ngDocFocusable]="true" data-ng-doc-focus-trap="true" (focus)="focusPrev()"></div>
    <ng-content></ng-content>
    <div [ngDocFocusable]="true" data-ng-doc-focus-trap="true" (focus)="focusNext()"></div>
  `,
  styles: [':host {width: 100%}'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocFocusableDirective],
})
export class NgDocFocusControlComponent {
  private readonly documentRef = inject<Document>(DOCUMENT);

  /** Element from which the focus moves on when it leaves the content. */
  readonly focusHost = input<HTMLElement | null>(null);

  /** Focuses the focusable element before `focusHost`. */
  focusPrev(): void {
    const focusHost: HTMLElement | null = this.focusHost();

    if (focusHost) {
      NgDocFocusUtils.focusClosestElement(focusHost, this.documentRef.body, false);
    }
  }

  /** Focuses the focusable element after `focusHost`. */
  focusNext(): void {
    const focusHost: HTMLElement | null = this.focusHost();

    if (focusHost) {
      NgDocFocusUtils.focusClosestElement(focusHost, this.documentRef.body);
    }
  }
}
