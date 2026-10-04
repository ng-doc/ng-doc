import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning';

/**
 * Shows a short status label.
 */
@Component({
  selector: 'app-badge',
  template: `<span class="badge" [attr.data-tone]="tone()">{{ label() }}</span>`,
  styles: `
    .badge {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 999px;
      font-size: 0.875rem;
      background: var(--ng-doc-base-2);
      color: var(--ng-doc-text);
    }

    .badge[data-tone='info'] {
      background: var(--ng-doc-info);
      color: var(--ng-doc-info-text);
    }

    .badge[data-tone='success'] {
      background: var(--ng-doc-success);
      color: var(--ng-doc-success-text);
    }

    .badge[data-tone='warning'] {
      background: var(--ng-doc-warning);
      color: var(--ng-doc-warning-text);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BadgeComponent {
  /** The text inside the badge. */
  readonly label = input('Badge');
  /** The color of the badge. */
  readonly tone = input<BadgeTone>('neutral');
}
