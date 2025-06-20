import { ChangeDetectionStrategy, Component, DOCUMENT, inject, Input } from '@angular/core';
import { NgDocFocusableDirective } from '@ng-doc/ui-kit/directives/focusable';
import { NgDocFocusUtils } from '@ng-doc/ui-kit/utils';

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
  private documentRef = inject<Document>(DOCUMENT);

  @Input()
  focusHost: HTMLElement | null = null;

  constructor() {}

  focusPrev(): void {
    if (this.focusHost) {
      NgDocFocusUtils.focusClosestElement(this.focusHost, this.documentRef.body, false);
    }
  }

  focusNext(): void {
    if (this.focusHost) {
      NgDocFocusUtils.focusClosestElement(this.focusHost, this.documentRef.body);
    }
  }
}
