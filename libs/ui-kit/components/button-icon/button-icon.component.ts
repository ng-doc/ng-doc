import { booleanAttribute, ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgDocSize } from '@ng-doc/ui-kit/types';

/**
 * A square button that holds a single icon.
 *
 * The `large` size is the 36px header button. Set `[rounded]="false"` for the rounded-square
 * shape of the NgDoc header.
 * @example
 * ```html
 * <button ng-doc-button-icon size="large" [rounded]="false" aria-label="Open menu">
 *   <ng-doc-icon icon="menu" />
 * </button>
 * ```
 */
@Component({
  selector:
    'button[ng-doc-button-icon], a[ng-doc-button-icon], button[ng-doc-button-icon-raised], a[ng-doc-button-icon-raised], button[ng-doc-button-icon-transparent], a[ng-doc-button-icon-transparent]',
  templateUrl: './button-icon.component.html',
  styleUrls: ['./button-icon.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-ng-doc-size]': 'size()',
    '[attr.data-ng-doc-rounded]': 'rounded()',
  },
})
export class NgDocButtonIconComponent {
  /**
   * Size of the button: `small` (24px), `medium` (32px) or `large` (36px).
   */
  readonly size = input<NgDocSize>('medium');

  /**
   * Whether the button is a circle. When `false`, it is a rounded square.
   */
  readonly rounded = input<boolean, unknown>(true, { transform: booleanAttribute });
}
