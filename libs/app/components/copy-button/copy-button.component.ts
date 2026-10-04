import { Clipboard } from '@angular/cdk/clipboard';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { NgDocButtonIconComponent, NgDocTooltipDirective } from '@ng-doc/ui-kit';

/** The text a copy button copies, or a function that reads it when the button is pressed. */
export type NgDocCopyButtonText = string | (() => string);

/**
 * An icon button that copies a text to the clipboard and confirms it in a tooltip. Project the
 * icon into it.
 */
@Component({
  selector: 'ng-doc-copy-button',
  imports: [NgDocButtonIconComponent, NgDocTooltipDirective],
  template: `
    <button
      type="button"
      ng-doc-button-icon
      [rounded]="false"
      [attr.aria-label]="label()"
      (click)="copy()"
      [ngDocTooltip]="tooltipContent"
      (mouseenter)="tooltipText.set(label())">
      <ng-template #tooltipContent>
        {{ tooltipText() }}
      </ng-template>
      <ng-content></ng-content>
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocCopyButtonComponent {
  /** The text to copy, or a function that returns it when the button is pressed. */
  readonly text = input.required<NgDocCopyButtonText>();

  /** Accessible name of the button, also shown in its tooltip. */
  readonly label = input<string>('Copy to clipboard');

  /** The tooltip of the button. */
  readonly tooltip = viewChild.required(NgDocTooltipDirective);

  protected readonly tooltipText = signal<string>('');
  protected readonly clipboard = inject(Clipboard);

  /** Copies the text and shows the confirmation. */
  copy(): void {
    untracked(() => {
      const text: NgDocCopyButtonText = this.text();

      this.clipboard.copy(typeof text === 'function' ? text() : text);
      this.tooltipText.set('Copied!');
      this.tooltip().show();
    });
  }
}
